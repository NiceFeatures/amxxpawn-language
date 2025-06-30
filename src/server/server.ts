'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationParams,
    CompletionItem,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Definition,
    SignatureHelp,
    Hover,
    DocumentLink,
    Location,
    SymbolInformation,
    SymbolKind,
    Diagnostic,
    DiagnosticSeverity,
    DidChangeConfigurationNotification,
    DocumentLinkParams,
    Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as Settings from '../common/settings-types';
import * as Parser from './parser';
import * as Types from './types';
import * as DM from './dependency-manager';
import * as Helpers from './helpers';
import { resolvePathVariables } from '../common/helpers';

const connection = createConnection(ProposedFeatures.all);
const documentsManager = new TextDocuments(TextDocument);

let syncedSettings: Settings.SyncedSettings;
let dependencyManager: DM.FileDependencyManager = new DM.FileDependencyManager();
let documentsData: Map<string, Types.DocumentData> = new Map();
let dependenciesData: Map<DM.FileDependency, Types.DocumentData> = new Map();
let workspaceRoot: string | null = null;
let hasConfigurationCapability: boolean = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
    workspaceRoot = params.rootUri;
    hasConfigurationCapability = !!(params.capabilities.workspace && !!params.capabilities.workspace.configuration);

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            documentLinkProvider: { resolveProvider: false },
            definitionProvider: true,
            signatureHelpProvider: { triggerCharacters: ['(', ','] },
            documentSymbolProvider: true,
            completionProvider: { resolveProvider: false, triggerCharacters: ['(', ',', '=', '@'] },
            hoverProvider: true
        }
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
});

// AQUI ESTÁ A CORREÇÃO PRINCIPAL
// Esta função agora é muito mais segura.
connection.onDidChangeConfiguration(async () => {
    if (hasConfigurationCapability) {
        // Em vez de confiar no objeto 'change', nós proativamente
        // pedimos a configuração mais recente. Isso evita o erro de 'null'.
        try {
            syncedSettings = await connection.workspace.getConfiguration('amxxpawn');
        } catch (e) {
            connection.console.error(`Error fetching configuration: ${e}`);
            // Usa um objeto vazio como fallback para evitar crashes
            syncedSettings = { compiler: {} as Settings.CompilerSettings, language: {} as Settings.LanguageSettings };
        }
    }
    // Re-analisa todos os documentos com a configuração nova (ou de fallback).
    documentsManager.all().forEach(reparseDocument);
});


connection.onDocumentLinks((params: DocumentLinkParams): DocumentLink[] | null => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return null;
    const data = documentsData.get(document.uri);
    if (!data) return null;

    if (syncedSettings?.language?.webApiLinks === true) {
        return data.resolvedInclusions.map(inc => {
            let filename = inc.descriptor.filename.replace(/\.inc$/, '');
            const range = Range.create(inc.descriptor.start, inc.descriptor.end);
            return DocumentLink.create(range, `https://amxx-bg.info/api/${filename}`);
        });
    }
    
    return null;
});

async function validateAndReparse(document: TextDocument): Promise<void> {
    if (hasConfigurationCapability && !syncedSettings) {
        try {
            syncedSettings = await connection.workspace.getConfiguration({
                scopeUri: document.uri,
                section: 'amxxpawn'
            });
        } catch (e) {
            connection.console.error(`Could not fetch configuration: ${e}`);
        }
    }
    reparseDocument(document);
}

function reparseDocument(document: TextDocument) {
    let data = documentsData.get(document.uri);
    if (data === undefined) {
        data = new Types.DocumentData(document.uri);
        documentsData.set(document.uri, data);
    }

    if (data.reparseTimer) {
        clearTimeout(data.reparseTimer);
        data.reparseTimer = null;
    }

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    parseFile(URI.parse(document.uri), document.getText(), data, diagnostics, false);
    
    const allDocsData = documentsManager.all().map((doc) => documentsData.get(doc.uri)).filter(d => d !== undefined) as Types.DocumentData[];
    Helpers.removeUnreachableDependencies(allDocsData, dependencyManager, dependenciesData);

    diagnostics.forEach((ds, uri) => connection.sendDiagnostics({ uri: uri, diagnostics: ds }));
}

connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return null;
    const data = documentsData.get(document.uri);
    if (!data) return null;

    function inclusionLocation(inclusions: Types.ResolvedInclusion[]): Location | null {
        for (const inc of inclusions) {
            if (params.position.line === inc.descriptor.start.line &&
                params.position.character > inc.descriptor.start.character &&
                params.position.character < inc.descriptor.end.character) {
                return Location.create(inc.uri, { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } });
            }
        }
        return null;
    };

    const location = inclusionLocation(data.resolvedInclusions);
    if (location) return location;

    return Parser.doDefinition(document.getText(), params.position, data, dependenciesData);
});

connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return null;
    const data = documentsData.get(document.uri);
    if (!data) return null;

    return Parser.doSignatures(document.getText(), params.position, Helpers.getSymbols(data, dependenciesData).callables);
});

connection.onDocumentSymbol((params): SymbolInformation[] | null => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return null;
    const data = documentsData.get(document.uri);
    if (!data) return null;

    return data.callables.map<SymbolInformation>((clb) => ({
        name: clb.identifier,
        location: { range: { start: clb.start, end: clb.end }, uri: params.textDocument.uri },
        kind: SymbolKind.Function
    }));
});

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] | null => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return null;
    const data = documentsData.get(document.uri);
    if (!data) return null;

    return Parser.doCompletions(connection, document.getText(), params.position, data, dependenciesData);
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return null;
    const data = documentsData.get(document.uri);
    if (!data) return null;

    return Parser.doHover(document.getText(), params.position, data, dependenciesData);
});

documentsManager.onDidOpen((event) => {
    validateAndReparse(event.document);
});

documentsManager.onDidClose((event) => {
    const docData = documentsData.get(event.document.uri);
    if (docData) {
        Helpers.removeDependencies(docData.dependencies, dependencyManager, dependenciesData);
        const allOpenDocsData = documentsManager.all()
            .map(doc => documentsData.get(doc.uri))
            .filter((d): d is Types.DocumentData => d !== undefined);
        Helpers.removeUnreachableDependencies(allOpenDocsData, dependencyManager, dependenciesData);
        documentsData.delete(event.document.uri);
    }
});

documentsManager.onDidChangeContent((change) => {
    validateAndReparse(change.document);
});

function resolveIncludePath(filename: string, documentPath: string, localTo: string | undefined): string | undefined {
    const workspacePath = workspaceRoot ? URI.parse(workspaceRoot).fsPath : undefined;
    
    const resolvedIncludePaths = (syncedSettings?.compiler?.includePaths || []).map(p => resolvePathVariables(p, workspacePath, documentPath));

    const finalIncludePaths = [...resolvedIncludePaths];
    if (localTo !== undefined) {
        finalIncludePaths.unshift(localTo);
    }

    for (const includePath of finalIncludePaths) {
        if (!includePath) continue;
        try {
            const fullPath = Path.join(includePath, filename);
            FS.accessSync(fullPath, FS.constants.R_OK);
            return URI.file(fullPath).toString();
        } catch (err) {
            try {
                const fullPathWithExt = Path.join(includePath, filename + '.inc');
                FS.accessSync(fullPathWithExt, FS.constants.R_OK);
                return URI.file(fullPathWithExt).toString();
            } catch (errInc) {
                continue;
            }
        }
    }
    return undefined;
}

function parseFile(fileUri: URI, content: string, data: Types.DocumentData, diagnostics: Map<string, Diagnostic[]>, isDependency: boolean) {
    let myDiagnostics: Diagnostic[] = [];
    diagnostics.set(data.uri, myDiagnostics);
    const dependencies: DM.FileDependency[] = [];

    const results = Parser.parse(fileUri, content, isDependency);

    data.resolvedInclusions = [];
    myDiagnostics.push(...results.diagnostics);

    const documentPath = fileUri.fsPath;

    results.headerInclusions.forEach((header) => {
        const localTo = header.isLocal ? Path.dirname(documentPath) : undefined;
        const resolvedUri = resolveIncludePath(header.filename, documentPath, localTo);
        
        if (resolvedUri === data.uri) return;

        if (resolvedUri !== undefined) {
            let dependency = dependencyManager.getDependency(resolvedUri);
            if (dependency === undefined) {
                dependency = dependencyManager.addReference(resolvedUri);
            } else if (!data.dependencies.includes(dependency)) {
                dependencyManager.addReference(dependency.uri);
            }
            dependencies.push(dependency);

            let depData = dependenciesData.get(dependency);
            if (depData === undefined) {
                depData = new Types.DocumentData(dependency.uri);
                dependenciesData.set(dependency, depData);
                try {
                    const dependencyUri = URI.parse(dependency.uri);
                    const fileContent = FS.readFileSync(dependencyUri.fsPath).toString();
                    parseFile(dependencyUri, fileContent, depData, diagnostics, true);
                } catch (e) {
                    connection.console.error(`Failed to read dependency file ${dependency.uri}: ${e.message}`);
                }
            }
            data.resolvedInclusions.push({ uri: resolvedUri, descriptor: header });
        } else {
            myDiagnostics.push({
                message: `Couldn't resolve include path '${header.filename}'. Check compiler include paths.`,
                severity: header.isSilent ? DiagnosticSeverity.Information : DiagnosticSeverity.Error,
                source: 'amxxpawn',
                range: { start: header.start, end: header.end }
            });
        }
    });

    const oldDeps = data.dependencies.filter((dep) => !dependencies.includes(dep));
    Helpers.removeDependencies(oldDeps, dependencyManager, dependenciesData);
    data.dependencies = dependencies;

    data.callables = results.callables;
    data.values = results.values;
}

documentsManager.listen(connection);
connection.listen();