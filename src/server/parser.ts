'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as StringHelpers from '../common/string-helpers';
import * as Types from './types';
import * as Helpers from './helpers';
import * as DM from './dependency-manager';
import { URI } from 'vscode-uri';

// --- Interfaces, Regex e Variáveis Globais ---

interface FindFunctionIdentifierResult {
    identifier: string;
    parameterIndex?: number;
}

// Regex aprimorada para identificar APENAS DEFINIÇÕES de funções no escopo global.
const callableDefinitionRegex = /^\s*(?:(public|static|stock|const)\s+)?([A-Za-z_@][\w@]*)\s*\(([^)]*)\)/;

const taskFunctions = new Set([
    'set_task', 'set_task_ex',
    'register_clcmd', 'register_concmd', 'register_srvcmd', 'SQL_ThreadQuery'
]);

let docComment = "";

// --- Funções Auxiliares ---

function positionToIndex(content: string, position: VSCLS.Position): number {
    const lines = content.split('\n');
    let index = 0;
    for (let i = 0; i < position.line; i++) {
        index += lines[i].length + 1;
    }
    return index + position.character;
}

function findIdentifierAtCursor(content: string, cursorIndex: number): { identifier: string; isCallable: boolean } {
    let result = { identifier: '', isCallable: false };
    if (cursorIndex >= content.length || !StringHelpers.isAlphaNum(content[cursorIndex])) {
        return result;
    }

    let start = cursorIndex;
    while (start > 0 && StringHelpers.isAlphaNum(content[start - 1])) {
        start--;
    }

    let end = cursorIndex;
    while (end < content.length - 1 && StringHelpers.isAlphaNum(content[end + 1])) {
        end++;
    }

    result.identifier = content.substring(start, end + 1);

    let checkParen = end + 1;
    while (checkParen < content.length && StringHelpers.isWhitespace(content[checkParen])) {
        checkParen++;
    }
    if (checkParen < content.length && content[checkParen] === '(') {
        result.isCallable = true;
    }
    
    return result;
}

function findFunctionIdentifier(content: string, cursorIndex: number): FindFunctionIdentifierResult {
    let index = cursorIndex - 1;
    let parenthesisDepth = 0;
    let identifier = '';
    let parameterIndex = 0;

    while(index >= 0) {
        const char = content[index];
        if(char === ';') return { identifier: '' };
        if(char === ',' && parenthesisDepth === 0) parameterIndex++;
        if(char === ')') parenthesisDepth++;
        if(char === '(') {
            if(parenthesisDepth > 0) {
                parenthesisDepth--;
            } else {
                let endOfIdent = index;
                while(endOfIdent > 0 && StringHelpers.isWhitespace(content[endOfIdent - 1])) {
                    endOfIdent--;
                }
                let startOfIdent = endOfIdent;
                while(startOfIdent > 0 && StringHelpers.isAlphaNum(content[startOfIdent - 1])) {
                    startOfIdent--;
                }
                identifier = content.substring(startOfIdent, endOfIdent);
                return { identifier, parameterIndex };
            }
        }
        index--;
    }
    return { identifier: '' };
}

function findIdentifierBehindCursor(content: string, cursorIndex: number): string {
    let index = cursorIndex - 1;
    let identifier = '';
    while (index >= 0 && StringHelpers.isAlphaNum(content[index])) {
        identifier = content[index] + identifier;
        index--;
    }
    return identifier;
}


// --- Funções de Análise (Parsing) ---

function handleComments(lineContent: string): string {
    const singleCommentIndex = lineContent.indexOf('//');
    if (singleCommentIndex >= 0) {
        lineContent = lineContent.substring(0, singleCommentIndex);
    }
    docComment = ""; // Reinicia para cada linha para evitar associações incorretas
    return lineContent.trim();
}

export function parse(fileUri: URI, content: string, skipStatic: boolean): Types.ParserResults {
    const results = new Types.ParserResults();
    let bracketDepth = 0;

    const lines = content.split(/\r?\n/);
    lines.forEach((originalLine, lineIndex) => {
        const lineContent = handleComments(originalLine);

        if (!lineContent) return;

        // A lógica de `bracketDepth` impede que chamadas dentro de funções sejam confundidas com definições.
        const openBraces = (lineContent.match(/{/g) || []).length;
        const closeBraces = (lineContent.match(/}/g) || []).length;
        
        if (bracketDepth === 0 && openBraces > 0) { // Entrando em um escopo
             // Analisa a linha ANTES de incrementar o bracketDepth
        } else if (bracketDepth > 0) { // Já dentro de um escopo
            bracketDepth += openBraces;
            bracketDepth -= closeBraces;
            return; // Pula a análise de conteúdo dentro de funções
        }
        
        // Lida com includes
        if (lineContent.startsWith('#include') || lineContent.startsWith('#tryinclude')) {
            const match = lineContent.match(/#\s*(?:try)?include\s*(?:<|")(.+?)(?:>|")/);
            if (match && match[1]) {
                results.headerInclusions.push({
                    filename: match[1],
                    isLocal: lineContent.includes('"'),
                    isSilent: lineContent.startsWith('#tryinclude'),
                    start: { line: lineIndex, character: 0 },
                    end: { line: lineIndex, character: originalLine.length }
                });
            }
        }

        // Lida com definições de funções (callables)
        const callableMatch = lineContent.match(callableDefinitionRegex);
        if (callableMatch) {
            const specifier = callableMatch[1];
            const identifier = callableMatch[2];
            const params = callableMatch[3];

            if (skipStatic && specifier === 'static') return;
            
            const existingIndex = results.callables.findIndex(c => c.identifier === identifier);
            const newCallable = {
                label: callableMatch[0].trim(),
                identifier: identifier,
                file: fileUri,
                start: { line: lineIndex, character: originalLine.indexOf(identifier) },
                end: { line: lineIndex, character: originalLine.indexOf(identifier) + identifier.length },
                parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                documentaton: docComment
            };

            if (existingIndex !== -1) {
                results.callables[existingIndex] = newCallable;
            } else {
                results.callables.push(newCallable);
            }
        }
        
        bracketDepth += openBraces;
        bracketDepth -= closeBraces;
    });

    return results;
}

// --- Funções do Language Server ---

export function doDefinition(
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.Location | null {

    const symbols = Helpers.getSymbols(data, dependenciesData);
    const line = content.split('\n')[position.line];
    
    // LÓGICA SEMÂNTICA: Verifica se o clique foi em uma string dentro de uma task
    const stringRegex = /"([^"]+)"/g;
    let match;
    while ((match = stringRegex.exec(line)) !== null) {
        const stringContent = match[1];
        const startIndex = match.index + 1;
        const endIndex = startIndex + stringContent.length;

        if (position.character >= startIndex && position.character <= endIndex) {
            // O clique foi em uma string. Agora, verificamos se é uma função de task.
            for (const taskFn of taskFunctions) {
                if (line.includes(`${taskFn}(`)) {
                    // Encontramos! Procuramos a definição da função com o nome da string.
                    const callable = symbols.callables.find(clb => clb.identifier === stringContent);
                    if (callable) {
                        return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
                    }
                }
            }
        }
    }

    // Se não for o caso especial acima, usa a lógica padrão
    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (result.identifier.length === 0) {
        return null;
    }
    
    const potentialIdentifiers = [result.identifier];
    if (result.identifier.startsWith('@')) {
        potentialIdentifiers.push(result.identifier.substring(1));
    } else {
        potentialIdentifiers.push('@' + result.identifier);
    }
    
    if (result.isCallable) {
        const callable = symbols.callables.find(clb => potentialIdentifiers.includes(clb.identifier));
        if (callable) {
            if (position.line === callable.start.line) return null;
            return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
        }
    } else {
        const value = symbols.values.find(val => potentialIdentifiers.includes(val.identifier));
        if (value) {
            if (position.line === value.range.start.line) return null;
            return VSCLS.Location.create(value.file.toString(), value.range);
        }
    }

    return null;
}


export function doHover(
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.Hover | null {

    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (result.identifier.length === 0) return null;

    const symbols = Helpers.getSymbols(data, dependenciesData);
    if (result.isCallable) {
        const callable = symbols.callables.find(c => c.identifier === result.identifier);
        if (!callable || position.line === callable.start.line) return null;
        return { contents: [{ language: 'amxxpawn', value: callable.label }, { language: 'pawndoc', value: callable.documentaton }] };
    } else {
        const value = symbols.values.find(v => v.identifier === result.identifier);
        if (value && position.line !== value.range.start.line) {
            return { contents: [{ language: 'amxxpawn', value: value.label }, { language: 'pawndoc', value: value.documentaton }] };
        }
    }
    return null;
}

export function doCompletions(
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.CompletionItem[] | null {

    const cursorIndex = positionToIndex(content, position);
    const identifier = findIdentifierBehindCursor(content, cursorIndex).toLowerCase();
    if (identifier.length === 0) return null;
    
    const results = Helpers.getSymbols(data, dependenciesData);
    const values = results.values.filter((val) => StringHelpers.fuzzy(val.identifier, identifier));
    const callables = results.callables.filter((clb) => StringHelpers.fuzzy(clb.identifier, identifier));
    
    return values.map<VSCLS.CompletionItem>((val) => ({
        label: val.identifier,
        detail: val.label,
        kind: val.isConst ? VSCLS.CompletionItemKind.Constant : VSCLS.CompletionItemKind.Variable,
        insertText: val.identifier.startsWith('@') ? val.identifier.substring(1) : val.identifier,
        documentation: val.documentaton
    }))
    .concat(callables.map<VSCLS.CompletionItem>((clb) => ({
        label: clb.identifier,
        detail: clb.label,
        kind: VSCLS.CompletionItemKind.Function,
        insertText: clb.identifier.startsWith('@') ? clb.identifier.substring(1) : clb.identifier,
        documentation: clb.documentaton
    })));
}

export function doSignatures(content: string, position: VSCLS.Position, callables: Types.CallableDescriptor[]): VSCLS.SignatureHelp | null {
    const cursorIndex = positionToIndex(content, position);
    const result = findFunctionIdentifier(content, cursorIndex);
    if (!result.identifier) return null;

    const callable = callables.find(c => c.identifier === result.identifier);
    if (!callable || callable.start.line === callable.start.line) return null;
    
    return {
        activeSignature: 0,
        activeParameter: result.parameterIndex,
        signatures: [{
            label: callable.label,
            parameters: callable.parameters,
            documentation: callable.documentaton
        }]
    };
}