'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as StringHelpers from '../common/string-helpers';
import * as Types from './types';
import * as Helpers from './helpers';
import * as DM from './dependency-manager';
import { URI } from 'vscode-uri';

interface FindFunctionIdentifierResult {
    identifier: string;
    parameterIndex?: number;
}

const callableDefinitionRegex = /^\s*(?:(forward|native|public|static|stock)\s+)?(?:([A-Za-z_@][\w@]*)\s*:\s*)?([A-Za-z_@][\w@]+)\s*\(([^)]*)\)/;
const defineRegex = /^#define\s+([A-Za-z_@][\w@]*)(?:\(([^)]*)\))?\s*(.*)/;
const globalVarRegex = /^\s*(new|static|const|public)\s+([A-Za-z_@][\w@:]+)\s*\[?/;
let docComment = "";
const taskFunctions = new Set(['set_task', 'set_task_ex', 'register_clcmd', 'register_concmd', 'register_srvcmd']);

const pawnKeywords = [
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'return',
    'new', 'public', 'static', 'stock', 'const', 'forward', 'native',
    'enum', 'bool', 'break', 'continue', 'sizeof', 'defined'
];

function positionToIndex(content: string, position: VSCLS.Position): number {
    const lines = content.split('\n');
    let index = 0;
    for (let i = 0; i < position.line; i++) {
        index += lines[i].length + 1;
    }
    return index + position.character;
}

function findIdentifierAtCursor(content: string, cursorIndex: number): { identifier: string; isCallable: boolean } {
    const result = { identifier: '', isCallable: false };
    if (cursorIndex >= content.length || !StringHelpers.isAlphaNum(content[cursorIndex])) return result;
    let start = cursorIndex;
    while (start > 0 && StringHelpers.isAlphaNum(content[start - 1])) start--;
    let end = cursorIndex;
    while (end < content.length - 1 && StringHelpers.isAlphaNum(content[end + 1])) end++;
    result.identifier = content.substring(start, end + 1);
    let checkParen = end + 1;
    while (checkParen < content.length && StringHelpers.isWhitespace(content[checkParen])) checkParen++;
    if (checkParen < content.length && content[checkParen] === '(') result.isCallable = true;
    return result;
}

function handleComments(lineContent: string): string {
    const singleCommentIndex = lineContent.indexOf('//');
    if (singleCommentIndex >= 0) lineContent = lineContent.substring(0, singleCommentIndex);
    docComment = "";
    return lineContent.trim();
}

export function parse(fileUri: URI, content: string, skipStatic: boolean): Types.ParserResults {
    const results = new Types.ParserResults();
    let bracketDepth = 0;
    const lines = content.split(/\r?\n/);

    lines.forEach((originalLine, lineIndex) => {
        const lineContent = handleComments(originalLine);
        if (!lineContent) return;

        const openBraces = (lineContent.match(/{/g) || []).length;
        const closeBraces = (lineContent.match(/}/g) || []).length;
        if (bracketDepth > 0) {
            bracketDepth += openBraces - closeBraces;
            return;
        }

        if (lineContent.startsWith('#include') || lineContent.startsWith('#tryinclude')) {
            const match = lineContent.match(/#\s*(?:try)?include\s*(?:<|")(.+?)(?:>|")/);
            if (match && match[1]) {
                results.headerInclusions.push({
                    filename: match[1], isLocal: lineContent.includes('"'), isSilent: lineContent.startsWith('#tryinclude'),
                    start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length }
                });
            }
        } else if (lineContent.startsWith('#define')) {
            const match = lineContent.match(defineRegex);
            if (match) {
                const [, identifier, params, value] = match;
                if (params !== undefined) {
                     results.callables.push({
                        label: lineContent, identifier, file: fileUri,
                        start: { line: lineIndex, character: originalLine.indexOf(identifier) },
                        end: { line: lineIndex, character: originalLine.indexOf(identifier) + identifier.length },
                        parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                        documentaton: `Macro: ${lineContent}`, isForward: false
                    });
                } else {
                    results.constants.push({
                        identifier, value: value.trim(), label: `#define ${identifier} ${value.trim()}`, file: fileUri,
                        range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length } }
                    });
                }
            }
        } else {
            const callableMatch = lineContent.match(callableDefinitionRegex);
            if (callableMatch) {
                const [, specifier, tag, identifier, params] = callableMatch;
                const isForward = (specifier === 'forward' || specifier === 'native');
                if (skipStatic && specifier === 'static') return;
                
                const newCallable: Types.CallableDescriptor = {
                    label: callableMatch[0].trim(), identifier, file: fileUri,
                    start: { line: lineIndex, character: originalLine.indexOf(identifier) },
                    end: { line: lineIndex, character: originalLine.indexOf(identifier) + identifier.length },
                    parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                    documentaton: docComment, isForward
                };

                const existingCallableIndex = results.callables.findIndex(c => c.identifier === identifier);
                if (existingCallableIndex === -1) {

                    results.callables.push(newCallable);
                } else {
                    const existingCallable = results.callables[existingCallableIndex];

                    if (newCallable.isForward && !existingCallable.isForward) {
                        results.callables[existingCallableIndex] = newCallable;
                    }
                }
            } else {
                const varMatch = lineContent.match(globalVarRegex);
                if (varMatch) {
                    const identifier = (varMatch[2] || '').split(':').pop() || '';
                    if (identifier && !results.values.find(v => v.identifier === identifier)) {
                        results.values.push({
                            label: lineContent, identifier, isConst: lineContent.includes('const'), file: fileUri,
                            range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length } },
                            documentaton: docComment
                        });
                    }
                }
            }
        }
        bracketDepth += openBraces - closeBraces;
    });
    return results;
}

export function doDefinition(
    content: string, position: VSCLS.Position, data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.Location | null {

    const symbols = Helpers.getSymbols(data, dependenciesData);
    const line = content.split('\n')[position.line];
    
    const stringRegex = /"([^"]+)"/g;
    let match;
    while ((match = stringRegex.exec(line)) !== null) {
        const stringContent = match[1];
        if (position.character >= match.index + 1 && position.character <= match.index + 1 + stringContent.length) {
            for (const taskFn of taskFunctions) {
                if (line.includes(`${taskFn}(`)) {
                    const callable = symbols.callables.find(clb => clb.identifier === stringContent);
                    if (callable) return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
                }
            }
        }
    }

    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return null;

    const constant = symbols.constants.find(c => c.identifier === result.identifier);
    if (constant) {
        if (position.line === constant.range.start.line) return null;
        return VSCLS.Location.create(constant.file.toString(), constant.range);
    }
    
    const potentialIdentifiers = [result.identifier];
    if (result.identifier.startsWith('@')) potentialIdentifiers.push(result.identifier.substring(1));
    else potentialIdentifiers.push('@' + result.identifier);
    
    const callable = symbols.callables.find(clb => potentialIdentifiers.includes(clb.identifier));
    if (callable) {
        return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
    }
    
    const value = symbols.values.find(val => potentialIdentifiers.includes(val.identifier));
    if (value) {
        if (position.line === value.range.start.line) return null;
        return VSCLS.Location.create(value.file.toString(), value.range);
    }
    return null;
}

function findIdentifierBehindCursor(content: string, cursorIndex: number): string {
    let index = cursorIndex - 1, identifier = '';
    while (index >= 0 && StringHelpers.isAlphaNum(content[index])) {
        identifier = content[index] + identifier;
        index--;
    }
    return identifier;
}

export function doCompletions(
    connection: VSCLS.Connection,
    content: string, 
    position: VSCLS.Position, 
    data: Types.DocumentData, 
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>
): VSCLS.CompletionItem[] | null {

    const lineText = content.split('\n')[position.line];
    const linePrefix = lineText.substring(0, position.character);
    const openParenIndex = linePrefix.lastIndexOf('(');
    const closeParenIndex = linePrefix.lastIndexOf(')');

    // REGRA ÚNICA: Se o cursor estiver dentro de um bloco de parênteses (...),
    // não importa se é uma definição ou uma chamada, nós não queremos sugestões globais.
    // Retornar uma lista vazia é a forma correta de dizer "não tenho nada para sugerir aqui".
    if (openParenIndex > closeParenIndex) {
        return [];
    }

    // A lógica abaixo agora só será executada FORA dos parênteses.
    const cursorIndex = positionToIndex(content, position);
    const identifier = findIdentifierBehindCursor(content, cursorIndex);
    
    if (identifier.length === 0) {
        return null;
    }
    
    const { values, callables, constants } = Helpers.getSymbols(data, dependenciesData);
    const lowerIdentifier = identifier.toLowerCase();
    const allItems: VSCLS.CompletionItem[] = [];

    pawnKeywords.forEach(keyword => {
        if (keyword.toLowerCase().startsWith(lowerIdentifier)) {
            allItems.push({ label: keyword, kind: VSCLS.CompletionItemKind.Keyword });
        }
    });

    constants.filter(c => c.identifier.toLowerCase().startsWith(lowerIdentifier))
        .forEach(c => allItems.push({ label: c.identifier, detail: c.label, kind: VSCLS.CompletionItemKind.Constant }));
    
    values.filter(v => v.identifier.toLowerCase().startsWith(lowerIdentifier))
        .forEach(v => allItems.push({ label: v.identifier, detail: v.label, kind: v.isConst ? VSCLS.CompletionItemKind.Constant : VSCLS.CompletionItemKind.Variable, insertText: v.identifier.startsWith('@') ? v.identifier.substring(1) : v.identifier, documentation: v.documentaton }));
        
    callables.filter(c => c.identifier.toLowerCase().startsWith(lowerIdentifier))
        .forEach(c => allItems.push({ label: c.identifier, detail: c.label, kind: VSCLS.CompletionItemKind.Function, insertText: c.identifier.startsWith('@') ? c.identifier.substring(1) : c.identifier, documentation: c.documentaton }));

    return allItems;
}

function findFunctionIdentifier(content: string, cursorIndex: number): FindFunctionIdentifierResult {
    let index = cursorIndex - 1, parenthesisDepth = 0, identifier = '', parameterIndex = 0;
    while(index >= 0) {
        const char = content[index];
        if(char === ';') return { identifier: '' };
        if(char === ',' && parenthesisDepth === 0) parameterIndex++;
        if(char === ')') parenthesisDepth++;
        if(char === '(') {
            if(parenthesisDepth > 0) { parenthesisDepth--; }
            else {
                let endOfIdent = index;
                while(endOfIdent > 0 && StringHelpers.isWhitespace(content[endOfIdent - 1])) endOfIdent--;
                let startOfIdent = endOfIdent;
                while(startOfIdent > 0 && StringHelpers.isAlphaNum(content[startOfIdent - 1])) startOfIdent--;
                identifier = content.substring(startOfIdent, endOfIdent);
                return { identifier, parameterIndex };
            }
        }
        index--;
    }
    return { identifier: '' };
}


export function doHover(
    content: string, position: VSCLS.Position, data: Types.DocumentData, dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.Hover | null {
    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return null;
    const symbols = Helpers.getSymbols(data, dependenciesData);
    
    const constant = symbols.constants.find(c => c.identifier === result.identifier);
    if(constant) return { contents: [{ language: 'amxxpawn', value: constant.label }]};

    const idsToSearch = [result.identifier];
    if (result.identifier.startsWith('@')) idsToSearch.push(result.identifier.substring(1));
    else idsToSearch.push('@' + result.identifier);

    const callable = symbols.callables.find(c => idsToSearch.includes(c.identifier));
    if (callable) {
        return { contents: [{ language: 'amxxpawn', value: callable.label }, { language: 'pawndoc', value: callable.documentaton }] };
    }
    
    const value = symbols.values.find(v => idsToSearch.includes(v.identifier));
    if (value && position.line !== value.range.start.line) {
        return { contents: [{ language: 'amxxpawn', value: value.label }, { language: 'pawndoc', value: value.documentaton }] };
    }
    return null;
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
        signatures: [{ label: callable.label, parameters: callable.parameters, documentation: callable.documentaton }]
    };
}