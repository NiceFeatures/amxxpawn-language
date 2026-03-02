'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
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
    Range,
    FileChangeType,
    SemanticTokensBuilder
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

// --- Fix #2: Cache de conteúdo de includes ---
const includeContentCache: Map<string, string> = new Map();

// --- Fix #3: Debounce timers por documento ---
const reparseTimers: Map<string, NodeJS.Timeout> = new Map();
const REPARSE_DELAY = 300; // ms

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
            hoverProvider: true,
            semanticTokensProvider: {
                full: true,
                legend: {
                    tokenTypes: [...Types.SemanticTokenTypes],
                    tokenModifiers: [...Types.SemanticTokenModifiers]
                }
            }
        }
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
});

connection.onDidChangeConfiguration(async () => {
    if (hasConfigurationCapability) {
        try {
            syncedSettings = await connection.workspace.getConfiguration('amxxpawn');
        } catch (e) {
            connection.console.error(`Error fetching configuration: ${e}`);
            syncedSettings = { compiler: {} as Settings.CompilerSettings, language: {} as Settings.LanguageSettings };
        }
    }
    // Limpa cache de includes quando configuração muda (paths podem ter mudado)
    includeContentCache.clear();
    documentsManager.all().forEach((doc) => scheduleReparse(doc));
});

// --- Fix #2: Handler de mudanças em arquivos do workspace ---
// Quando um .inc é salvo/modificado externamente, invalida o cache e re-parseia
connection.onDidChangeWatchedFiles((params) => {
    let needsReparse = false;

    for (const change of params.changes) {
        const changedUri = change.uri;

        // Invalida o cache do arquivo modificado
        if (includeContentCache.has(changedUri)) {
            includeContentCache.delete(changedUri);
            needsReparse = true;
        }

        // Se o arquivo foi deletado, limpa dependências dele
        if (change.type === FileChangeType.Deleted) {
            const dep = dependencyManager.getDependency(changedUri);
            if (dep) {
                const depData = dependenciesData.get(dep);
                if (depData) {
                    Helpers.removeDependencies(depData.dependencies, dependencyManager, dependenciesData);
                }
                dependenciesData.delete(dep);
                needsReparse = true;
            }
        }

        // Se um .inc foi modificado, força re-parse das dependências
        if (change.type === FileChangeType.Changed) {
            const dep = dependencyManager.getDependency(changedUri);
            if (dep) {
                // Remove dados antigos para forçar re-parse
                dependenciesData.delete(dep);
                needsReparse = true;
            }
        }
    }

    if (needsReparse) {
        documentsManager.all().forEach((doc) => scheduleReparse(doc));
    }
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
    doReparse(document);
}

// --- Fix #3: Debounce — agenda reparse com delay ---
function scheduleReparse(document: TextDocument) {
    const uri = document.uri;

    // Cancela timer anterior se existir
    const existingTimer = reparseTimers.get(uri);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Agenda novo reparse com delay
    const timer = setTimeout(() => {
        reparseTimers.delete(uri);
        validateAndReparse(document);
    }, REPARSE_DELAY);

    reparseTimers.set(uri, timer);
}

function doReparse(document: TextDocument) {
    let data = documentsData.get(document.uri);
    if (data === undefined) {
        data = new Types.DocumentData(document.uri);
        documentsData.set(document.uri, data);
    }

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    parseFile(URI.parse(document.uri), document.getText(), data, diagnostics, false);

    // --- Fix #4: Limpa dependências órfãs ---
    Helpers.removeUnreachableDependencies(
        documentsManager.all()
            .map(doc => documentsData.get(doc.uri))
            .filter((d): d is Types.DocumentData => d !== undefined),
        dependencyManager,
        dependenciesData
    );

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
    // Cancela timer de debounce pendente
    const timer = reparseTimers.get(event.document.uri);
    if (timer) {
        clearTimeout(timer);
        reparseTimers.delete(event.document.uri);
    }

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

// --- Fix #3: onDidChangeContent usa debounce ---
documentsManager.onDidChangeContent((change) => {
    scheduleReparse(change.document);
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

// --- Fix #2: Função auxiliar para ler include com cache ---
function readIncludeContent(uri: string): string | null {
    // Verifica se já está no cache
    const cached = includeContentCache.get(uri);
    if (cached !== undefined) {
        return cached;
    }

    // Lê do disco e armazena no cache
    try {
        const fsPath = URI.parse(uri).fsPath;
        const content = FS.readFileSync(fsPath).toString();
        includeContentCache.set(uri, content);
        return content;
    } catch (e) {
        connection.console.error(`Failed to read file ${uri}: ${e}`);
        return null;
    }
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

                // --- Fix #2: Usa cache em vez de readFileSync direto ---
                const fileContent = readIncludeContent(dependency.uri);
                if (fileContent !== null) {
                    const dependencyUri = URI.parse(dependency.uri);
                    parseFile(dependencyUri, fileContent, depData, diagnostics, true);
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
    data.constants = results.constants;
    data.semanticTokens = results.semanticTokens;
}

// --- Semantic Tokens Provider ---
connection.languages.semanticTokens.on((params) => {
    const document = documentsManager.get(params.textDocument.uri);
    if (!document) return { data: [] };

    const data = documentsData.get(document.uri);
    if (!data) return { data: [] };

    const builder = new SemanticTokensBuilder();

    // Tokens devem ser ordenados por posição (linha, coluna)
    const sortedTokens = [...data.semanticTokens].sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.char - b.char;
    });

    for (const token of sortedTokens) {
        builder.push(
            token.line,
            token.char,
            token.length,
            token.tokenType,
            token.tokenModifiers
        );
    }

    return builder.build();
});

documentsManager.listen(connection);
connection.listen();