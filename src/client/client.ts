'use strict';

import * as Path from 'path';
import * as VSC from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import * as Commands from './commands';

let client: LanguageClient;
let diagnosticCollection: VSC.DiagnosticCollection;

export function activate(ctx: VSC.ExtensionContext) {
    const serverModulePath = ctx.asAbsolutePath(Path.join('dist', 'server.js'));
    const debugOptions = { execArgv: ['--nolazy', '--inspect=5858'] };

    const serverOptions: ServerOptions = {
        run: { module: serverModulePath, transport: TransportKind.ipc },
        debug: {
            module: serverModulePath,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'amxxpawn' }],
        synchronize: {
            configurationSection: 'amxxpawn',
            fileEvents: VSC.workspace.createFileSystemWatcher('**/*.{sma,inc}')
        },
        initializationOptions: {
            globalStoragePath: ctx.globalStorageUri.fsPath
        }
    };

    client = new LanguageClient(
        'amxxpawn',
        'AMXXPawn Language Service',
        serverOptions,
        clientOptions
    );

    client.start();

    const outputChannel = VSC.window.createOutputChannel('AMXXPC Output / AMXXPawn');
    diagnosticCollection = VSC.languages.createDiagnosticCollection('amxxpawn');
    
    const onCompilerDownloaded = () => {
        try { client.sendNotification('amxxpawn/reparseAll'); } catch { /* ignore */ }
    };
    const commandCompile = VSC.commands.registerCommand('amxxpawn.compile', Commands.compile.bind(null, outputChannel, diagnosticCollection, ctx, onCompilerDownloaded));
    const commandCompileLocal = VSC.commands.registerCommand('amxxpawn.compileLocal', Commands.compileLocal.bind(null, outputChannel, diagnosticCollection));
    const commandCreatePlugin = VSC.commands.registerCommand('amxxpawn.createPlugin', Commands.createPlugin.bind(null, ctx, onCompilerDownloaded));

    VSC.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
    
    ctx.subscriptions.push(
        client,
        diagnosticCollection,
        commandCompile,
        commandCompileLocal,
        commandCreatePlugin,
        outputChannel
    );
}

function onDidChangeTextDocument(ev: VSC.TextDocumentChangeEvent) {
    diagnosticCollection.delete(ev.document.uri);
    VSC.window.visibleTextEditors.forEach(e => {
        if (e.document.uri.fsPath === ev.document.uri.fsPath) {
            e.setDecorations(Commands.inlineErrorDecorationType, []);
        }
    });
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }

    return client.stop();
}