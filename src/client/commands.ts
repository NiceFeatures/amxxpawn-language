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
            outputChannel.appendLine(`❌ Erro: O caminho de saída "${resolvedPath}" não existe. Compilação abortada.`);
            return;
        }
        outputPath = Path.join(resolvedPath, Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else if (compilerSettings.outputType === 'source') {
        outputPath = Path.join(Path.dirname(inputPath), Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else {
        outputChannel.appendLine('❌ Erro: O valor da configuração \'amxxpawn.compiler.outputType\' é inválido.');
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
        outputChannel.appendLine(`Iniciando amxxpc: "${executablePath}" ${compilerArgs.join(' ')}\n`);
    }

    let compilerStdout = '';

    const amxxpcProcess = CP.spawn(`"${executablePath}"`, compilerArgs, spawnOptions);

    amxxpcProcess.stdout.on('data', (data) => {
        compilerStdout += data.toString();
    });

    amxxpcProcess.stderr.on('data', (data) => {
        outputChannel.append('stderr: ' + data.toString());
    });

    amxxpcProcess.on('error', (err) => {
        outputChannel.appendLine(`❌ Falha ao iniciar amxxpc: ${err.message}`);
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
            outputChannel.appendLine('Relatório da Compilação:');
            outputChannel.appendLine('--------------------------------------------------\n');
        }

        for (const [filePath, data] of outputData.entries()) {
            const resourceDiagnostics: VSC.Diagnostic[] = [];

            outputChannel.appendLine(`📄 Arquivo: ${filePath}`);

            data.diagnostics.forEach((diag) => {
                const type = diag.type.toUpperCase();
                outputChannel.appendLine(`  [${type}] Linha ${diag.startLine}: ${diag.message}`);

                const range = new VSC.Range(diag.startLine - 1, 0, (diag.endLine || diag.startLine) - 1, Number.MAX_VALUE);
                const severity = type === 'ERROR' ? VSC.DiagnosticSeverity.Error : VSC.DiagnosticSeverity.Warning;
                resourceDiagnostics.push(new VSC.Diagnostic(range, diag.message, severity));
            });
            diagnosticCollection.set(VSC.Uri.file(filePath), resourceDiagnostics);
            outputChannel.appendLine('');
        }

        //
        // LÓGICA DE SAÍDA FINAL (CORRIGIDA)
        //
        const headerSizeMatch = compilerStdout.match(/Header size:\s*(\d+)\s*bytes/);
        const codeSizeMatch = compilerStdout.match(/Code size:\s*(\d+)\s*bytes/);
        const dataSizeMatch = compilerStdout.match(/Data size:\s*(\d+)\s*bytes/);
        const totalSizeMatch = compilerStdout.match(/Total requirements:\s*(\d+)\s*bytes/);

        if (hasErrors) {
            outputChannel.appendLine(`❌ Compilação falhou após ${compilationTime} segundos. Veja os erros acima.`);
        } else if (hasWarnings) {
            outputChannel.appendLine(`⚠️  Compilação concluída com avisos em ${compilationTime} segundos.`);
            outputChannel.appendLine(`   Saída gerada em: ${outputPath}`);
        } else if (/Done\./.test(compilerStdout)) {
            try {
                const stats = FS.statSync(outputPath);
                const fileSizeInKB = (stats.size / 1024).toFixed(2);

                outputChannel.appendLine('╔════════════════════════════════════════════════');
                outputChannel.appendLine('║ ✅  Compilação Concluída com Sucesso!');
                outputChannel.appendLine('╠════════════════════════════════════════════════');
                outputChannel.appendLine(`║ Plugin:     ${Path.basename(outputPath)}`);
                outputChannel.appendLine(`║ Saída:      ${outputPath}`);
                outputChannel.appendLine(`║ Tamanho:    ${fileSizeInKB} KB`);
                outputChannel.appendLine(`║ Tempo:      ${compilationTime} segundos`);

                if (headerSizeMatch || codeSizeMatch || dataSizeMatch) {
                    outputChannel.appendLine('╟────────────────────────────────────────────────');
                    outputChannel.appendLine('║ Estatísticas do Compilador:');
                    if (headerSizeMatch) outputChannel.appendLine(`║   Cabeçalho:  ${headerSizeMatch[1]} bytes`);
                    if (codeSizeMatch) outputChannel.appendLine(`║   Código:     ${codeSizeMatch[1]} bytes`);
                    if (dataSizeMatch) outputChannel.appendLine(`║   Dados:      ${dataSizeMatch[1]} bytes`);
                    if (totalSizeMatch) outputChannel.appendLine(`║   Total Req.: ${totalSizeMatch[1]} bytes`);
                }

                outputChannel.appendLine('╚════════════════════════════════════════════════\n');

            } catch (error) {
                outputChannel.appendLine(`✅ Compilação Concluída em ${compilationTime}s. Saída: ${outputPath}\n`);
            }
        }

        if (compilerSettings.showInfoMessages === true && exitCode !== 0) {
            outputChannel.appendLine(`\nProcesso amxxpc finalizado com código ${exitCode}.`);
        }
    });
}

// As funções compile e compileLocal não precisam de mais alterações
export function compile(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    outputChannel.clear();
    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');
    if (!compilerSettings) { outputChannel.appendLine('❌ Configurações do compilador não encontradas.'); return; }
    if (compilerSettings.switchToOutput === true) { outputChannel.show(true); }
    const editor = VSC.window.activeTextEditor;
    if (!editor) { outputChannel.appendLine('Nenhuma janela com código Pawn ativa.'); return; }
    if (editor.document.uri.scheme !== 'file') { outputChannel.appendLine('O arquivo de entrada não está no disco.'); return; }
    const inputPath = editor.document.uri.fsPath;
    const executablePath = Helpers.resolvePathVariables(compilerSettings.executablePath, VSC.workspace.workspaceFolders?.[0]?.uri.fsPath, inputPath);
    if (!executablePath || !FS.existsSync(executablePath)) { outputChannel.appendLine(`❌ Compilador não encontrado em: ${executablePath}. Verifique suas configurações.`); return; }
    const tryCompile = () => {
        FS.access(executablePath, FS.constants.X_OK, (err) => {
            if (err) { outputChannel.appendLine('❌ Não foi possível acessar o amxxpc. Verifique o caminho e as permissões de execução.'); return; }
            doCompile(executablePath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
        });
    };
    if (editor.document.isDirty) {
        editor.document.save().then((isSuccess) => {
            if (isSuccess) tryCompile();
            else outputChannel.appendLine('❌ Falha ao salvar o arquivo.');
        });
    } else {
        tryCompile();
    }
}
export function compileLocal(outputChannel: VSC.OutputChannel, diagnosticCollection: VSC.DiagnosticCollection) {
    outputChannel.clear();
    const config = VSC.workspace.getConfiguration('amxxpawn');
    const compilerSettings = config.get<Settings.CompilerSettings>('compiler');
    if (!compilerSettings) { outputChannel.appendLine('Configurações do compilador não encontradas.'); return; }
    if (compilerSettings.switchToOutput === true) { outputChannel.show(true); }
    const editor = VSC.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') { outputChannel.appendLine('Nenhum arquivo Pawn válido aberto.'); return; }
    const inputPath = editor.document.uri.fsPath;
    const executableDir = Path.dirname(inputPath);
    FS.readdir(executableDir, (err, files) => {
        if (err) { throw err; }
        const potentialFiles = files.filter((file) => file.startsWith('amxxpc'));
        let executablePath: string;
        if (potentialFiles.includes('amxxpc.exe')) {
            executablePath = Path.join(executableDir, 'amxxpc.exe');
        } else {
            if (potentialFiles.length === 0) { outputChannel.appendLine(`Nenhum 'amxxpc' encontrado em '${executableDir}'.`); return; }
            if (potentialFiles.length > 1) { outputChannel.appendLine(`Resultado ambíguo: mais de um arquivo começando com 'amxxpc' em '${executableDir}'.`); return; }
            executablePath = Path.join(executableDir, potentialFiles[0]);
        }
        doCompile(executablePath, inputPath, compilerSettings, outputChannel, diagnosticCollection);
    });
}