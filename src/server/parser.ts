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

const callableDefinitionRegex = /^\s*(?:(forward|native|public|static|stock)\s+)?([A-Za-z_@][\w@:]+)\s*\(([^)]*)\)/;
const defineRegex = /^#define\s+([A-Za-z_@][\w@]*)(?:\(([^)]*)\))?\s*(.*)/;
const globalVarRegex = /^\s*(new|static|const|public)\s+([A-Za-z_@][\w@:]+)\s*\[?/;
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

export function parse(fileUri: URI, content: string, skipStatic: boolean): Types.ParserResults {
    const results = new Types.ParserResults();
    let bracketDepth = 0;
    const lines = content.split(/\r?\n/);
    let docComment = ""; 

    // **CORREÇÃO**: Trocado para um loop 'for' padrão para controlar o índice.
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const originalLine = lines[lineIndex];
        const trimmedLine = originalLine.trim();

        if (trimmedLine.startsWith('/**') && !trimmedLine.startsWith('/***')) {
            docComment = ''; // Inicia um novo doc-comment
            for (let i = lineIndex; i < lines.length; i++) {
                const commentLine = lines[i];
                const cleanedLine = commentLine.replace(/^\s*\/\*\*?/, '').replace(/\*\/$/, '').replace(/^\s*\*/, '').trim();
                docComment += cleanedLine + '\n';
                if (commentLine.trim().endsWith('*/')) {
                    lineIndex = i; // Pula o índice do loop para depois do bloco de comentário
                    break;
                }
            }
            continue; // Continua para a próxima linha do loop principal
        }

        const lineContent = trimmedLine.replace(/\/\/.*/, '').trim();
        if (!lineContent) {
            if (!trimmedLine.includes('*/')) { // Não apague o docComment se a linha for o fim de um bloco
               docComment = ""; 
            }
            continue;
        }

        const openBraces = (lineContent.match(/{/g) || []).length;
        const closeBraces = (lineContent.match(/}/g) || []).length;
        if (bracketDepth > 0) {
            bracketDepth += openBraces - closeBraces;
            continue;
        }

        if (lineContent.startsWith('#include') || lineContent.startsWith('#tryinclude')) {
            const match = lineContent.match(/#\s*(?:try)?include\s*(?:<|")\s*(.+?)\s*(?:>|")/);
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
                const [, specifier, fullIdentifier, params] = callableMatch;
                const identifier = (fullIdentifier || '').split(':').pop() || '';
                if (!identifier) continue;
                
                const newCallable: Types.CallableDescriptor = {
                    label: callableMatch[0].trim(),
                    identifier, file: fileUri,
                    start: { line: lineIndex, character: originalLine.indexOf(identifier) },
                    end: { line: lineIndex, character: originalLine.indexOf(identifier) + identifier.length },
                    parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                    documentaton: docComment.trim(),
                    isForward: specifier === 'forward' || specifier === 'native'
                };

                const existingCallableIndex = results.callables.findIndex(c => c.identifier.toLowerCase() === identifier.toLowerCase());
                if (existingCallableIndex === -1) {
                    if (!(skipStatic && specifier === 'static')) {
                        results.callables.push(newCallable);
                    }
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
                            documentaton: docComment.trim()
                        });
                    }
                }
            }
        }
        
        docComment = "";
        bracketDepth += openBraces - closeBraces;
    }
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
                    const callable = symbols.callables.find(clb => clb.identifier.toLowerCase() === stringContent.toLowerCase());
                    if (callable) return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
                }
            }
        }
    }

    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return null;

    const identifierLower = result.identifier.toLowerCase();

    const constant = symbols.constants.find(c => c.identifier.toLowerCase() === identifierLower);
    if (constant) {
        if (position.line === constant.range.start.line) return null;
        return VSCLS.Location.create(constant.file.toString(), constant.range);
    }
    
    const potentialIdentifiers = [result.identifier];
    if (result.identifier.startsWith('@')) potentialIdentifiers.push(result.identifier.substring(1));
    else potentialIdentifiers.push('@' + result.identifier);
    
    const callable = symbols.callables.find(clb => potentialIdentifiers.some(id => id.toLowerCase() === clb.identifier.toLowerCase()));
    if (callable) {
        return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
    }
    
    const value = symbols.values.find(val => potentialIdentifiers.some(id => id.toLowerCase() === val.identifier.toLowerCase()));
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

    if (openParenIndex > closeParenIndex) {
        return [];
    }

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
    let searchIndex = cursorIndex - 1;
    let parenDepth = 0;
    
    while (searchIndex >= 0) {
        const char = content[searchIndex];
        if (char === ')') {
            parenDepth++;
        } else if (char === '(') {
            if (parenDepth > 0) {
                parenDepth--;
            } else {
                const openParenPos = searchIndex;

                let endOfIdent = openParenPos;
                while (endOfIdent > 0 && StringHelpers.isWhitespace(content[endOfIdent - 1])) endOfIdent--;
                let startOfIdent = endOfIdent;
                while (startOfIdent > 0 && StringHelpers.isAlphaNum(content[startOfIdent - 1])) startOfIdent--;
                const identifier = content.substring(startOfIdent, endOfIdent);

                let parameterIndex = 0;
                for (let i = openParenPos + 1; i < cursorIndex; i++) {
                    if (content[i] === ',') {
                        parameterIndex++;
                    }
                }
                
                return { identifier, parameterIndex };
            }
        } else if (char === ';') {
            return { identifier: '' };
        }
        searchIndex--;
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

    const callable = symbols.callables.find(c => idsToSearch.some(id => id.toLowerCase() === c.identifier.toLowerCase()));
    if (callable) {
        return { contents: [{ language: 'amxxpawn', value: callable.label }, { language: 'pawndoc', value: callable.documentaton }] };
    }
    
    const value = symbols.values.find(v => idsToSearch.some(id => id.toLowerCase() === v.identifier.toLowerCase()));
    if (value && position.line !== value.range.start.line) {
        return { contents: [{ language: 'amxxpawn', value: value.label }, { language: 'pawndoc', value: value.documentaton }] };
    }
    return null;
}

export function doSignatures(content: string, position: VSCLS.Position, callables: Types.CallableDescriptor[]): VSCLS.SignatureHelp | null {
    const cursorIndex = positionToIndex(content, position);
    const result = findFunctionIdentifier(content, cursorIndex);

    if (!result.identifier) {
        return null;
    }
    
    const callable = callables.find(c => c.identifier.toLowerCase() === result.identifier.toLowerCase());
    
    if (!callable) {
        return null;
    }

    let activeParameter = 0;
    const openParenPos = content.lastIndexOf('(', cursorIndex - 1);

    if (openParenPos !== -1) {
        const textInParens = content.substring(openParenPos + 1, cursorIndex);
        const lastCommaPos = textInParens.lastIndexOf(',');
        const currentParamText = textInParens.substring(lastCommaPos + 1);

        if (currentParamText.trim().startsWith('.')) {
            const paramNameMatch = currentParamText.match(/\.(\w+)/);
            if (paramNameMatch) {
                const paramName = paramNameMatch[1];
                const foundIndex = callable.parameters.findIndex(p => {
                    if (typeof p.label !== 'string') {
                        return false;
                    }
                    const paramSignature = p.label.split('=')[0].trim();

                    const nameMatch = paramSignature.match(/(\w+)(?:\s*\[\s*\])?\s*$/);
                    
                    return nameMatch ? nameMatch[1] === paramName : false;
                });
                
                if (foundIndex !== -1) {
                    activeParameter = foundIndex;
                } else {
                    activeParameter = (textInParens.match(/,/g) || []).length;
                }
            }
        } else {
            activeParameter = (textInParens.match(/,/g) || []).length;
        }
    }

    return {
        activeSignature: 0,
        activeParameter: activeParameter,
        signatures: [{ 
            label: callable.label, 
            parameters: callable.parameters, 
            documentation: callable.documentaton 
        }]
    };
}