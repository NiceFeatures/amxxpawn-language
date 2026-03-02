'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as CP from 'child_process';
import * as VSC from 'vscode';
import * as Settings from '../common/settings-types';
import * as Helpers from '../common/helpers';

interface OutputDiagnostic {
    type: string;
    startLine: number;
    endLine?: number;
    message: string;
}

class OutputData {
    public diagnostics: OutputDiagnostic[] = [];
};

function doCompile(executablePath: string, inputPath: string, compilerSettings: Settings.CompilerSettings, outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    diagnosticCollection.clear();

    const startTime = process.hrtime();

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

        // Limpa o painel de problemas de arquivos que não têm mais erros
        const filesWithError = new Set(outputData.keys());
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

        for (const [filePath, data] of outputData.entries()) {
            const resourceDiagnostics: VSC.Diagnostic[] = [];

            outputChannel.appendLine(VSC.l10n.t('📄 File: {0}', filePath));

            data.diagnostics.forEach((diag) => {
                const type = diag.type.toUpperCase();
                outputChannel.appendLine(VSC.l10n.t('  [{0}] Line {1}: {2}', type, String(diag.startLine), diag.message));

                const range = new VSC.Range(diag.startLine - 1, 0, (diag.endLine || diag.startLine) - 1, Number.MAX_VALUE);
                const severity = type === 'ERROR' ? VSC.DiagnosticSeverity.Error : VSC.DiagnosticSeverity.Warning;
                resourceDiagnostics.push(new VSC.Diagnostic(range, diag.message, severity));
            });
            diagnosticCollection.set(VSC.Uri.file(filePath), resourceDiagnostics);
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

export function compile(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    outputChannel.clear();
    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');
    if (!compilerSettings) { outputChannel.appendLine(VSC.l10n.t('❌ Compiler settings not found.')); return; }
    if (compilerSettings.switchToOutput === true) { outputChannel.show(true); }
    const editor = VSC.window.activeTextEditor;
    if (!editor) { outputChannel.appendLine(VSC.l10n.t('No active Pawn editor.')); return; }
    if (editor.document.uri.scheme !== 'file') { outputChannel.appendLine(VSC.l10n.t('Input file is not on disk.')); return; }
    const inputPath = editor.document.uri.fsPath;
    const executablePath = Helpers.resolvePathVariables(compilerSettings.executablePath, VSC.workspace.workspaceFolders?.[0]?.uri.fsPath, inputPath);
    if (!executablePath || !FS.existsSync(executablePath)) { outputChannel.appendLine(VSC.l10n.t('❌ Compiler not found at: {0}. Check your settings.', executablePath || '')); return; }
    const tryCompile = () => {
        FS.access(executablePath, FS.constants.X_OK, (err) => {
            if (err) { outputChannel.appendLine(VSC.l10n.t('❌ Could not access amxxpc. Check the path and execute permissions.')); return; }
            doCompile(executablePath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
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