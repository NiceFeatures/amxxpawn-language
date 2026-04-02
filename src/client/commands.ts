'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as CP from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as VSC from 'vscode';
import * as Settings from '../common/settings-types';
import * as Helpers from '../common/helpers';

const COMPILER_ZIP_URL = 'https://github.com/NiceFeatures/amxxpawn-language/raw/master/compiler.zip';

function downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = FS.createWriteStream(destPath);
        const doRequest = (requestUrl: string, redirectCount: number) => {
            if (redirectCount > 5) {
                file.close();
                reject(new Error('Too many redirects'));
                return;
            }
            const client = requestUrl.startsWith('https') ? https : http;
            client.get(requestUrl, (response) => {
                if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    doRequest(response.headers.location, redirectCount + 1);
                    return;
                }
                if (response.statusCode !== 200) {
                    file.close();
                    reject(new Error(`Download failed with status ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', (err) => { file.close(); reject(err); });
            }).on('error', (err) => { file.close(); reject(err); });
        };
        doRequest(url, 0);
    });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const cmd = process.platform === 'win32'
            ? `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
            : `unzip -o "${zipPath}" -d "${destDir}"`;
        CP.exec(cmd, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function findAmxxpc(dir: string): string | null {
    const exeName = process.platform === 'win32' ? 'amxxpc.exe' : 'amxxpc';
    const direct = Path.join(dir, exeName);
    if (FS.existsSync(direct)) return direct;

    // Check subdirectories (e.g. compiler/)
    try {
        const entries = FS.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const nested = Path.join(dir, entry.name, exeName);
                if (FS.existsSync(nested)) return nested;
            }
        }
    } catch { /* ignore */ }
    return null;
}

async function ensureCompiler(context: VSC.ExtensionContext): Promise<string | null> {
    const compilerDir = Path.join(context.globalStorageUri.fsPath, 'compiler');

    // Check if already extracted
    const existing = findAmxxpc(compilerDir);
    if (existing) return existing;

    // Download and extract
    return VSC.window.withProgress({
        location: VSC.ProgressLocation.Notification,
        title: VSC.l10n.t('AMXXPawn: Downloading compiler...'),
        cancellable: false
    }, async (progress) => {
        try {
            // Ensure directories exist
            FS.mkdirSync(compilerDir, { recursive: true });

            const zipPath = Path.join(compilerDir, 'compiler.zip');

            progress.report({ message: VSC.l10n.t('Downloading from GitHub...') });
            await downloadFile(COMPILER_ZIP_URL, zipPath);

            progress.report({ message: VSC.l10n.t('Extracting compiler...') });
            await extractZip(zipPath, compilerDir);

            // Clean up zip
            try { FS.unlinkSync(zipPath); } catch { /* ignore */ }

            const extracted = findAmxxpc(compilerDir);
            if (extracted) {
                VSC.window.showInformationMessage(VSC.l10n.t('✅ AMXXPawn compiler downloaded and ready!'));
                return extracted;
            }

            VSC.window.showErrorMessage(VSC.l10n.t('❌ Could not find amxxpc after extraction.'));
            return null;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            VSC.window.showErrorMessage(VSC.l10n.t('❌ Failed to download compiler: {0}', message));
            return null;
        }
    });
}

interface OutputDiagnostic {
    type: string;
    startLine: number;
    endLine?: number;
    message: string;
}

class OutputData {
    public diagnostics: OutputDiagnostic[] = [];
};

export const inlineErrorDecorationType = VSC.window.createTextEditorDecorationType({
    isWholeLine: true
});

function doCompile(executablePath: string, inputPath: string, compilerSettings: Settings.CompilerSettings, outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    diagnosticCollection.clear();
    VSC.window.visibleTextEditors.forEach(e => e.setDecorations(inlineErrorDecorationType, []));

    const startTime = process.hrtime();
    // ... rest of doCompile logic to outputData.entries
    let outputPath = '';
    const workspaceRoot = VSC.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (compilerSettings.outputType === 'path') {
        const resolvedPath = Helpers.resolvePathVariables(compilerSettings.outputPath, workspaceRoot, inputPath);
        if (!resolvedPath || !FS.existsSync(resolvedPath)) {
            outputChannel.appendLine(VSC.l10n.t('❌ Error: Output path "{0}" does not exist. Compilation aborted.', resolvedPath || ''));
            return;
        }
        outputPath = Path.join(resolvedPath, Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else if (compilerSettings.outputType === 'source') {
        outputPath = Path.join(Path.dirname(inputPath), Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else {
        outputChannel.appendLine(VSC.l10n.t('❌ Error: The value of setting \'amxxpawn.compiler.outputType\' is invalid.'));
        return;
    }

    const compilerArgs: string[] = [
        `"${inputPath}"`,
        ...compilerSettings.options,
        ...compilerSettings.includePaths.map((path) => `-i"${Helpers.resolvePathVariables(path, workspaceRoot, inputPath)}"`),
        `-o"${outputPath}"`
    ];

    const spawnOptions: CP.SpawnOptions = {
        cwd: Path.dirname(executablePath),
        shell: true
    };

    if (compilerSettings.showInfoMessages === true) {
        outputChannel.appendLine(VSC.l10n.t('Starting amxxpc: "{0}" {1}\n', executablePath, compilerArgs.join(' ')));
    }

    let compilerStdout = '';

    const amxxpcProcess = CP.spawn(`"${executablePath}"`, compilerArgs, spawnOptions);

    amxxpcProcess.stdout.on('data', (data) => {
        compilerStdout += data.toString();
    });

    amxxpcProcess.stderr.on('data', (data) => {
        outputChannel.append(VSC.l10n.t('stderr: {0}', data.toString()));
    });

    amxxpcProcess.on('error', (err) => {
        outputChannel.appendLine(VSC.l10n.t('❌ Failed to start amxxpc: {0}', err.message));
    });

    amxxpcProcess.on('close', (exitCode) => {
        const endTime = process.hrtime(startTime);
        const compilationTime = (endTime[0] + endTime[1] / 1e9).toFixed(3);

        const outputData = new Map<string, OutputData>();
        const captureOutputRegex = /(.+?)\((\d+)(?:\s--\s(\d+))?\)\s:\s(warning|error)\s\d+:\s(.*)/g;
        let results: RegExpExecArray | null;

        let hasErrors = false;
        let hasWarnings = false;

        while ((results = captureOutputRegex.exec(compilerStdout)) !== null) {
            let data = outputData.get(results[1]);
            if (!data) {
                data = new OutputData();
                outputData.set(results[1], data);
            }
            const type = results[4];
            if (type === 'error') hasErrors = true;
            if (type === 'warning') hasWarnings = true;

            data.diagnostics.push({
                type: type, message: results[5],
                startLine: Number.parseInt(results[2], 10),
                endLine: results[3] ? Number.parseInt(results[3], 10) : undefined
            });
        }

        const resolvedData = new Map<string, OutputData>();

        for (const [filePath, data] of outputData.entries()) {
            let resolvedFilePath = filePath;
            if (!Path.isAbsolute(filePath)) {
                if (Path.basename(filePath) === Path.basename(inputPath)) {
                    resolvedFilePath = inputPath;
                } else {
                    const testLocalPath = Path.join(Path.dirname(inputPath), filePath);
                    if (FS.existsSync(testLocalPath)) {
                        resolvedFilePath = VSC.Uri.file(testLocalPath).fsPath;
                    } else if (workspaceRoot) {
                        const testWorkspacePath = Path.join(workspaceRoot, filePath);
                        if (FS.existsSync(testWorkspacePath)) {
                            resolvedFilePath = VSC.Uri.file(testWorkspacePath).fsPath;
                        }
                    }
                }
            } else {
                resolvedFilePath = VSC.Uri.file(filePath).fsPath;
            }
            let previousData = resolvedData.get(resolvedFilePath);
            if (previousData) {
                previousData.diagnostics.push(...data.diagnostics);
            } else {
                resolvedData.set(resolvedFilePath, data);
            }
        }

        // Limpa o painel de problemas de arquivos que não têm mais erros
        const filesWithError = new Set(resolvedData.keys());
        diagnosticCollection.forEach((uri) => {
            if (!filesWithError.has(uri.fsPath)) {
                diagnosticCollection.delete(uri);
            }
        });

        if (hasErrors || hasWarnings) {
            outputChannel.appendLine('--------------------------------------------------');
            outputChannel.appendLine(VSC.l10n.t('Compilation Report:'));
            outputChannel.appendLine('--------------------------------------------------\n');
        }

        for (const [filePath, data] of resolvedData.entries()) {
            const resourceDiagnostics: VSC.Diagnostic[] = [];
            const decorationOptions: VSC.DecorationOptions[] = [];

            outputChannel.appendLine(VSC.l10n.t('📄 File: {0}', filePath));

            data.diagnostics.forEach((diag) => {
                const type = diag.type.toUpperCase();
                outputChannel.appendLine(VSC.l10n.t('  [{0}] Line {1}: {2}', type, String(diag.startLine), diag.message));

                const range = new VSC.Range(diag.startLine - 1, 0, (diag.endLine || diag.startLine) - 1, 10000);
                const severity = type === 'ERROR' ? VSC.DiagnosticSeverity.Error : VSC.DiagnosticSeverity.Warning;
                resourceDiagnostics.push(new VSC.Diagnostic(range, diag.message, severity));

                decorationOptions.push({
                    range: new VSC.Range(diag.startLine - 1, 0, diag.startLine - 1, 10000),
                    renderOptions: {
                        after: {
                            contentText: `   // ${diag.message}`,
                            color: new VSC.ThemeColor(type === 'ERROR' ? 'errorForeground' : 'editorWarning.foreground'),
                            fontStyle: 'italic',
                            margin: '0 0 0 20px',
                        }
                    }
                });
            });
            const resourceUri = VSC.Uri.file(filePath);
            diagnosticCollection.set(resourceUri, resourceDiagnostics);
            
            VSC.window.visibleTextEditors.forEach(e => {
                if (e.document.uri.fsPath === resourceUri.fsPath) {
                    e.setDecorations(inlineErrorDecorationType, decorationOptions);
                }
            });

            outputChannel.appendLine('');
        }

        //
        // LÓGICA DE SAÍDA FINAL
        //
        const headerSizeMatch = compilerStdout.match(/Header size:\s*(\d+)\s*bytes/);
        const codeSizeMatch = compilerStdout.match(/Code size:\s*(\d+)\s*bytes/);
        const dataSizeMatch = compilerStdout.match(/Data size:\s*(\d+)\s*bytes/);
        const totalSizeMatch = compilerStdout.match(/Total requirements:\s*(\d+)\s*bytes/);

        if (hasErrors) {
            outputChannel.appendLine(VSC.l10n.t('❌ Compilation failed after {0} seconds. See errors above.', compilationTime));
        } else if (hasWarnings) {
            outputChannel.appendLine(VSC.l10n.t('⚠️  Compilation completed with warnings in {0} seconds.', compilationTime));
            outputChannel.appendLine(VSC.l10n.t('   Output generated at: {0}', outputPath));
        } else if (/Done\./.test(compilerStdout)) {
            try {
                const stats = FS.statSync(outputPath);
                const fileSizeInKB = (stats.size / 1024).toFixed(2);

                outputChannel.appendLine('╔════════════════════════════════════════════════');
                outputChannel.appendLine(VSC.l10n.t('║ ✅  Compilation Succeeded!'));
                outputChannel.appendLine('╠════════════════════════════════════════════════');
                outputChannel.appendLine(VSC.l10n.t('║ Plugin:     {0}', Path.basename(outputPath)));
                outputChannel.appendLine(VSC.l10n.t('║ Output:     {0}', outputPath));
                outputChannel.appendLine(VSC.l10n.t('║ Size:       {0} KB', fileSizeInKB));
                outputChannel.appendLine(VSC.l10n.t('║ Time:       {0} seconds', compilationTime));

                if (headerSizeMatch || codeSizeMatch || dataSizeMatch) {
                    outputChannel.appendLine('╟────────────────────────────────────────────────');
                    outputChannel.appendLine(VSC.l10n.t('║ Compiler Statistics:'));
                    if (headerSizeMatch) outputChannel.appendLine(VSC.l10n.t('║   Header:     {0} bytes', headerSizeMatch[1]));
                    if (codeSizeMatch) outputChannel.appendLine(VSC.l10n.t('║   Code:       {0} bytes', codeSizeMatch[1]));
                    if (dataSizeMatch) outputChannel.appendLine(VSC.l10n.t('║   Data:       {0} bytes', dataSizeMatch[1]));
                    if (totalSizeMatch) outputChannel.appendLine(VSC.l10n.t('║   Total Req.: {0} bytes', totalSizeMatch[1]));
                }

                outputChannel.appendLine('╚════════════════════════════════════════════════\n');

            } catch (error) {
                outputChannel.appendLine(VSC.l10n.t('✅ Compilation finished in {0}s. Output: {1}\n', compilationTime, outputPath));
            }
        }

        if (compilerSettings.showInfoMessages === true && exitCode !== 0) {
            outputChannel.appendLine(VSC.l10n.t('\namxxpc process finished with exit code {0}.', String(exitCode)));
        }
    });
}

export async function compile(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection, context: VSC.ExtensionContext) {
    outputChannel.clear();
    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');
    if (!compilerSettings) { outputChannel.appendLine(VSC.l10n.t('❌ Compiler settings not found.')); return; }
    if (compilerSettings.switchToOutput === true) { outputChannel.show(true); }
    const editor = VSC.window.activeTextEditor;
    if (!editor) { outputChannel.appendLine(VSC.l10n.t('No active Pawn editor.')); return; }
    if (editor.document.uri.scheme !== 'file') { outputChannel.appendLine(VSC.l10n.t('Input file is not on disk.')); return; }
    const inputPath = editor.document.uri.fsPath;

    let executablePath = Helpers.resolvePathVariables(compilerSettings.executablePath, VSC.workspace.workspaceFolders?.[0]?.uri.fsPath, inputPath);

    // Auto-download fallback: if no compiler configured, try to download from GitHub
    if (!executablePath || !FS.existsSync(executablePath)) {
        outputChannel.appendLine(VSC.l10n.t('⚙️  No compiler configured. Attempting auto-download...'));
        const autoPath = await ensureCompiler(context);
        if (!autoPath) {
            outputChannel.appendLine(VSC.l10n.t('❌ Compiler not found. Configure "amxxpawn.compiler.executablePath" or check your internet connection.'));
            return;
        }
        executablePath = autoPath;
        outputChannel.appendLine(VSC.l10n.t('✅ Using auto-downloaded compiler: {0}', executablePath));
    }

    const finalExecPath = executablePath;
    const tryCompile = () => {
        FS.access(finalExecPath, FS.constants.X_OK, (err) => {
            if (err) { outputChannel.appendLine(VSC.l10n.t('❌ Could not access amxxpc. Check the path and execute permissions.')); return; }
            doCompile(finalExecPath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
        });
    };
    if (editor.document.isDirty) {
        editor.document.save().then((isSuccess) => {
            if (isSuccess) tryCompile();
            else outputChannel.appendLine(VSC.l10n.t('❌ Failed to save the file.'));
        });
    } else {
        tryCompile();
    }
}
export function compileLocal(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    outputChannel.clear();
    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');
    if (!compilerSettings) { outputChannel.appendLine(VSC.l10n.t('Compiler settings not found.')); return; }
    if (compilerSettings.switchToOutput === true) { outputChannel.show(true); }
    const editor = VSC.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') { outputChannel.appendLine(VSC.l10n.t('No valid Pawn file is open.')); return; }
    const inputPath = editor.document.uri.fsPath;
    const executableDir = Path.dirname(inputPath);
    FS.readdir(executableDir, (err, files) => {
        if (err) { throw err; }
        const potentialFiles = files.filter((file) => file.startsWith('amxxpc'));
        let executablePath: string;
        if (potentialFiles.includes('amxxpc.exe')) {
            executablePath = Path.join(executableDir, 'amxxpc.exe');
        } else {
            if (potentialFiles.length === 0) { outputChannel.appendLine(VSC.l10n.t('No \'amxxpc\' found in \'{0}\'.', executableDir)); return; }
            if (potentialFiles.length > 1) { outputChannel.appendLine(VSC.l10n.t('Ambiguous result: more than one file starting with \'amxxpc\' in \'{0}\'.', executableDir)); return; }
            executablePath = Path.join(executableDir, potentialFiles[0]);
        }
        doCompile(executablePath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
    });
}