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
    public diagnostics: OutputDiagnostic[];
    public constructor() {
        this.diagnostics = [];
    }
};

function doCompile(executablePath: string, inputPath: string, compilerSettings: Settings.CompilerSettings, outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    diagnosticCollection.clear();

    let outputPath = '';
    const workspaceRoot = VSC.workspace.rootPath;

    if (compilerSettings.outputType === 'path') {
        const resolvedPath = Helpers.resolvePathVariables(compilerSettings.outputPath, workspaceRoot, inputPath);
        if (!resolvedPath || !FS.existsSync(resolvedPath)) {
            outputChannel.appendLine(`Output path "${resolvedPath}" does not exist. Compilation aborted.`);
            return;
        }
        outputPath = Path.join(resolvedPath, Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else if (compilerSettings.outputType === 'source') {
        outputPath = Path.join(Path.dirname(inputPath), Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else {
        outputChannel.appendLine('\'amxxpawn.compiler.outputType\' setting has an invalid value.');
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
        outputChannel.appendLine(`Starting amxxpc: "${executablePath}" ${compilerArgs.join(' ')}\n`);
    }

    let compilerStdout = '';
    
    const amxxpcProcess = CP.spawn(`"${executablePath}"`, compilerArgs, spawnOptions);

    amxxpcProcess.stdout.on('data', (data) => {
        const textData = (data instanceof Buffer) ? data.toString() : data as string;
        if (compilerSettings.reformatOutput === false) {
            outputChannel.append(textData);
        } else {
            compilerStdout += textData;
        }
    });

    amxxpcProcess.stderr.on('data', (data) => {
        outputChannel.append('stderr: ' + data.toString());
    });

    amxxpcProcess.on('error', (err) => {
        outputChannel.appendLine(`Failed to start amxxpc: ${err.message}`);
    });

    amxxpcProcess.on('close', (exitCode) => {
        if (compilerSettings.reformatOutput === true) {
            const outputData = new Map<string, OutputData>();
            let results: RegExpExecArray | null;
            const captureOutputRegex = /(.+?)\((\d+)(?:\s--\s(\d+))?\)\s:\s(warning|error)\s\d+:\s(.*)/g;

            while ((results = captureOutputRegex.exec(compilerStdout)) !== null) {
                let data = outputData.get(results[1]);
                if (data === undefined) {
                    data = new OutputData();
                    outputData.set(results[1], data);
                }
                data.diagnostics.push({
                    type: results[4],
                    message: results[5],
                    startLine: Number.parseInt(results[2], 10),
                    endLine: results[3] !== undefined ? Number.parseInt(results[3], 10) : undefined
                });
            }

            if (/Done\./.test(compilerStdout)) {
                let outputFilePath = '';
                if (VSC.workspace.rootPath) {
                    const relativePath = Path.relative(VSC.workspace.rootPath, outputPath);
                    if (!relativePath.startsWith('../')) {
                        outputFilePath = relativePath;
                    }
                }
                outputChannel.appendLine('Success');
                outputChannel.appendLine('Output: ' + (outputFilePath || outputPath) + '\n');
            }

            for (const [filePath, data] of outputData.entries()) {
                const resourceDiagnostics: VSC.Diagnostic[] = [];
                let displayPath = filePath;
                if (VSC.workspace.rootPath) {
                    const relativePath = Path.relative(VSC.workspace.rootPath, filePath);
                    if (!relativePath.startsWith('../')) {
                        displayPath = relativePath;
                    }
                }

                outputChannel.appendLine(`===== ${displayPath} =====`);
                
                //
                // AQUI ESTÁ A CORREÇÃO
                //
                data.diagnostics.filter((diag) => diag.type === 'warning').forEach((diag) => {
                    outputChannel.appendLine(`WARNING [${diag.startLine}${diag.endLine !== undefined ? ` -- ${diag.endLine}` : ''}]: ${diag.message}`);
                    const range = new VSC.Range(diag.startLine - 1, 0, (diag.endLine !== undefined ? diag.endLine : diag.startLine) - 1, Number.MAX_VALUE);
                    resourceDiagnostics.push(new VSC.Diagnostic(range, `WARNING: ${diag.message}`, VSC.DiagnosticSeverity.Warning));
                });
                data.diagnostics.filter((diag) => diag.type === 'error').forEach((diag) => {
                    outputChannel.appendLine(`ERROR [${diag.startLine}${diag.endLine !== undefined ? ` -- ${diag.endLine}` : ''}]: ${diag.message}`);
                    const range = new VSC.Range(diag.startLine - 1, 0, (diag.endLine !== undefined ? diag.endLine : diag.startLine) - 1, Number.MAX_VALUE);
                    resourceDiagnostics.push(new VSC.Diagnostic(range, `ERROR: ${diag.message}`, VSC.DiagnosticSeverity.Error));
                });

                diagnosticCollection.set(VSC.Uri.file(filePath), resourceDiagnostics);
                outputChannel.append('\n');
            }
        }

        if (compilerSettings.showInfoMessages === true) {
            outputChannel.appendLine(`\namxxpc exited with code ${exitCode}.`);
        }
    });
}

export function compile(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    outputChannel.clear();

    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');
    if (!compilerSettings) {
        outputChannel.appendLine('Compiler settings not found.');
        return;
    }

    if (compilerSettings.switchToOutput === true) {
        outputChannel.show();
    }

    const editor = VSC.window.activeTextEditor;
    if (!editor) {
        outputChannel.appendLine('No active window with Pawn code.');
        return;
    }
    if (editor.document.uri.scheme !== 'file') {
        outputChannel.appendLine('The input file is not a file on the disk.');
        return;
    }
    const inputPath = editor.document.uri.fsPath;
    const executablePath = Helpers.resolvePathVariables(compilerSettings.executablePath, VSC.workspace.rootPath, inputPath);

    if (!executablePath || !FS.existsSync(executablePath)) {
        outputChannel.appendLine(`Compiler not found at: ${executablePath}. Please check your settings.`);
        return;
    }
    
    const tryCompile = () => {
        FS.access(executablePath, FS.constants.X_OK, (err) => {
            if (err) {
                outputChannel.appendLine('Cannot access amxxpc. Please check if the path is correct and if you have permissions to execute it.');
                return;
            }
            doCompile(executablePath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
        });
    };

    if (editor.document.isDirty) {
        editor.document.save().then((isSuccess) => {
            if (isSuccess) {
                tryCompile();
            } else {
                outputChannel.appendLine('File save failed.');
            }
        });
    } else {
        tryCompile();
    }
}

export function compileLocal(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    outputChannel.clear();
    
    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');

    if(!compilerSettings) {
        outputChannel.appendLine('Compiler settings not found.');
        return;
    }

    if(compilerSettings.switchToOutput === true) {
        outputChannel.show();
    }

    const editor = VSC.window.activeTextEditor;
    if(editor === undefined) {
        outputChannel.appendLine('No active window with Pawn code.');
        return;
    }
    if(editor.document.uri.scheme !== 'file') {
        outputChannel.appendLine('The input file is not a file on the disk.');
        return;
    }
    const inputPath = editor.document.uri.fsPath;

    const executableDir = Path.dirname(inputPath);
    FS.readdir(executableDir, (err, files) => {
        if(err) {
            throw err;
        }

        const potentialFiles = files.filter((file) => file.substring(0, 6) === 'amxxpc');
        let executablePath: string;

        const amxxpcExeIndex = potentialFiles.indexOf('amxxpc.exe');
        if(amxxpcExeIndex >= 0) {
            executablePath = Path.join(executableDir, potentialFiles[amxxpcExeIndex]);
        } else {
            if(potentialFiles.length === 0) {
                outputChannel.appendLine(`There are no files starting with 'amxxpc' in '${executableDir}'. Failed detecting amxxpc executable.`);
                return;
            }
            if(potentialFiles.length > 1) {
                outputChannel.appendLine(`Ambiguous result: there is more than 1 file in '${executableDir}' starting with 'amxxpc'. Failed detecting amxxpc executable.`);
                return;
            }
            executablePath = Path.join(executableDir, potentialFiles[0]);
        }

        FS.access(executablePath, FS.constants.X_OK, (err) => {
            if(err) {
                outputChannel.appendLine('Can\'t access amxxpc. Please check if you have permissions to execute amxxpc.');
                return;
            }
            
            doCompile(executablePath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
        });
    });
}