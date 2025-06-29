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
    const serverModulePath = ctx.asAbsolutePath(Path.join('build', 'server', 'server.js'));
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
            fileEvents: VSC.workspace.createFileSystemWatcher('**/*.*')
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
    
    const commandCompile = VSC.commands.registerCommand('amxxpawn.compile', Commands.compile.bind(null, outputChannel, diagnosticCollection));
    const commandCompileLocal = VSC.commands.registerCommand('amxxpawn.compileLocal', Commands.compileLocal.bind(null, outputChannel, diagnosticCollection));

    VSC.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
    
    ctx.subscriptions.push(
        client,
        diagnosticCollection,
        commandCompile,
        commandCompileLocal,
        outputChannel
    );
}

function onDidChangeTextDocument(ev: VSC.TextDocumentChangeEvent) {
    diagnosticCollection.delete(ev.document.uri);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }

    return client.stop();
}