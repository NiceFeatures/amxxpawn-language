'use strict';

import * as FS from 'fs';
import * as VSCLS from 'vscode-languageserver';
import * as StringHelpers from '../common/string-helpers';
import * as Types from './types';
import * as Helpers from './helpers';
import * as DM from './dependency-manager';
import { URI } from 'vscode-uri';
import * as Path from 'path';

interface FindFunctionIdentifierResult {
    identifier: string;
    parameterIndex?: number;
}

const callableDefinitionRegex = /^\s*(?:(forward|native|public|static|stock)\s+)?([A-Za-z_@][\w@:]+)\s*\(([^)]*)\)/;
const callableStartRegex = /^\s*(?:(?:forward|native|public|static|stock)\s+)?[A-Za-z_@][\w@:]+\s*\(/;
const defineRegex = /^#define\s+([A-Za-z_@][\w@]*)(?:\(([^)]*)\))?\s*(.*)/;
const globalVarRegex = /^\s*(new|static|const|public)\s+([A-Za-z_@][\w@:]+)\s*\[?/;
const localVarRegex = /^\s*(?:new|static|const)\s+(.+)/;
const enumRegex = /^\s*enum\s+(?:[A-Za-z_@][\w@:]*\s*)?{/;
const taskFunctions = new Set(['set_task', 'set_task_ex', 'register_clcmd', 'register_concmd', 'register_srvcmd']);

const preprocessorDirectives = [
    'include', 'tryinclude', 'define', 'if', 'else', 'endif',
    'pragma', 'error', 'endinput', 'undef'
];

function extractParamName(param: string): string | null {
    if (!param) return null;
    const noDefault = param.split('=')[0].trim();
    const noArray = noDefault.replace(/\[.*?\]$/g, '').trim();
    const noRef = noArray.replace(/^&/, '').trim();
    const match = noRef.match(/([A-Za-z_@][\w@]*)$/);
    return match ? match[1] : null;
}

const pawnKeywords = [
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'return',
    'new', 'public', 'static', 'stock', 'const', 'forward', 'native',
    'enum', 'bool', 'break', 'continue', 'sizeof', 'defined'
];

interface JoinedSignature {
    joinedLine: string;
    linesConsumed: number;
}

function joinMultiLineSignature(lines: string[], startIndex: number): JoinedSignature | null {
    const firstLine = lines[startIndex].trim().replace(/\/\/.*/, '').trim();
    // Count parens on first line
    let depth = 0;
    for (const ch of firstLine) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
    }
    // If balanced or no open paren, no multi-line needed
    if (depth <= 0) return null;

    let joined = firstLine;
    const maxLookahead = 30;
    let consumed = 0;

    for (let i = startIndex + 1; i < lines.length && i <= startIndex + maxLookahead; i++) {
        const nextLine = lines[i].trim().replace(/\/\/.*/, '').trim();
        if (!nextLine) { consumed++; continue; }
        joined += ' ' + nextLine;
        consumed++;
        for (const ch of nextLine) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
        }
        if (depth <= 0) {
            return { joinedLine: joined, linesConsumed: consumed };
        }
    }
    return null; // Never balanced — not a valid signature
}

function positionToIndex(content: string, position: VSCLS.Position): number {
    const lines = content.split('\n');
    let index = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) {
        index += lines[i].length + 1; // +1 for the \n
    }
    return index + position.character;
}

function findIdentifierAtCursor(content: string, cursorIndex: number): { identifier: string; isCallable: boolean } {
    const result = { identifier: '', isCallable: false };
    // Handle cursor past end or on non-alphanumeric (e.g. \r at line end)
    if (cursorIndex >= content.length) return result;
    let idx = cursorIndex;
    if (!StringHelpers.isAlphaNum(content[idx])) {
        // Try one character back (cursor might be just after the identifier)
        if (idx > 0 && StringHelpers.isAlphaNum(content[idx - 1])) {
            idx = idx - 1;
        } else {
            return result;
        }
    }
    let start = idx;
    while (start > 0 && StringHelpers.isAlphaNum(content[start - 1])) start--;
    let end = idx;
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
    let currentFunctionStartLine = -1;
    let currentFunctionLocals: { identifier: string; line: number; col: number; len: number; isConst: boolean; label: string; }[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const originalLine = lines[lineIndex];
        const trimmedLine = originalLine.trim();

        if (trimmedLine.startsWith('/**') && !trimmedLine.startsWith('/***')) {
            docComment = '';
            for (let i = lineIndex; i < lines.length; i++) {
                const commentLine = lines[i];
                const cleanedLine = commentLine.replace(/^\s*\/\*\*?/, '').replace(/\*\/$/, '').replace(/^\s*\*/, '').trim();
                docComment += cleanedLine + '\n';
                if (commentLine.trim().endsWith('*/')) {
                    lineIndex = i;
                    break;
                }
            }
            continue;
        }

        const lineContent = trimmedLine.replace(/\/\/.*/, '').trim();
        if (!lineContent) {
            if (!trimmedLine.includes('*/')) {
                docComment = "";
            }
            continue;
        }

        // Remove strings para não contar braces dentro delas
        const noStrings = lineContent.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const openBraces = (noStrings.match(/{/g) || []).length;
        const closeBraces = (noStrings.match(/}/g) || []).length;
        if (bracketDepth > 0) {
            // --- Parse local variable declarations inside function bodies ---
            if (currentFunctionStartLine >= 0) {
                const localMatch = lineContent.match(localVarRegex);
                if (localMatch) {
                    const isConst = lineContent.trimStart().startsWith('const');
                    const isStatic = lineContent.trimStart().startsWith('static');
                    // Remove array brackets for splitting, then parse each var
                    const declPart = localMatch[1];
                    const segments = declPart.replace(/\[.*?\]/g, '').split(',');
                    for (const seg of segments) {
                        const identMatch = seg.trim().match(/^(?:([A-Za-z_@][\w@]*):)?([A-Za-z_@][\w@]*)/);
                        if (identMatch) {
                            const tagName = identMatch[1];
                            const varName = identMatch[2];
                            if (!pawnKeywords.includes(varName)) {
                                if (tagName) {
                                    const tagCol = originalLine.indexOf(tagName, originalLine.search(/\S/));
                                    if (tagCol >= 0) {
                                        results.semanticTokens.push({
                                            line: lineIndex, char: tagCol, length: tagName.length,
                                            tokenType: 6, tokenModifiers: 0 // type
                                        });
                                    }
                                }
                                const varCol = originalLine.indexOf(varName, originalLine.search(/\S/));
                                if (varCol >= 0) {
                                    currentFunctionLocals.push({
                                        identifier: varName, line: lineIndex,
                                        col: varCol, len: varName.length,
                                        isConst, label: lineContent.trim()
                                    });
                                    let modifiers = 1; // declaration
                                    if (isConst) modifiers |= 2; // readonly
                                    if (isStatic) modifiers |= 4; // static
                                    results.semanticTokens.push({
                                        line: lineIndex, char: varCol, length: varName.length,
                                        tokenType: 2, tokenModifiers: modifiers // variable
                                    });
                                }
                            }
                        }
                    }
                }
            }

            bracketDepth += openBraces - closeBraces;

            // Function scope ended — finalize local variables
            if (bracketDepth === 0 && currentFunctionStartLine >= 0) {
                for (const local of currentFunctionLocals) {
                    results.localVariables.push({
                        identifier: local.identifier, file: fileUri,
                        range: { start: { line: local.line, character: local.col }, end: { line: local.line, character: local.col + local.len } },
                        scopeStartLine: currentFunctionStartLine,
                        scopeEndLine: lineIndex,
                        isConst: local.isConst, label: local.label
                    });
                }
                currentFunctionLocals = [];
                currentFunctionStartLine = -1;
            }
            continue;
        }

        if (lineContent.startsWith('#include') || lineContent.startsWith('#tryinclude')) {
            const match = lineContent.match(/#\s*(?:try)?include\s*(?:<|")\s*(.+?)\s*(?:>|")/);
            if (match?.[1]) {
                results.headerInclusions.push({
                    filename: match[1], isLocal: lineContent.includes('"'), isSilent: lineContent.startsWith('#tryinclude'),
                    start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length }
                });

                // Semantic: #include keyword
                const keyword = lineContent.startsWith('#tryinclude') ? '#tryinclude' : '#include';
                const kwCol = originalLine.indexOf(keyword.charAt(0));
                results.semanticTokens.push({
                    line: lineIndex, char: kwCol, length: keyword.length,
                    tokenType: 5, tokenModifiers: 0 // keyword
                });

                // Semantic: filename
                const fnameStart = originalLine.indexOf(match[1]);
                if (fnameStart >= 0) {
                    results.semanticTokens.push({
                        line: lineIndex, char: fnameStart, length: match[1].length,
                        tokenType: 7, tokenModifiers: 0 // string
                    });
                }
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
                        documentation: `Macro: ${lineContent}`, isForward: false
                    });
                    // Semantic: macro declaration
                    const macroCol = originalLine.indexOf(identifier);
                    if (macroCol >= 0) {
                        results.semanticTokens.push({
                            line: lineIndex, char: macroCol, length: identifier.length,
                            tokenType: 1, tokenModifiers: 1 // macro, readonly
                        });
                    }
                } else {
                    results.constants.push({
                        identifier, value: value.trim(), label: `#define ${identifier} ${value.trim()}`, file: fileUri,
                        range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length } }
                    });
                    // Semantic: constant (readonly)
                    const constCol = originalLine.indexOf(identifier);
                    if (constCol >= 0) {
                        results.semanticTokens.push({
                            line: lineIndex, char: constCol, length: identifier.length,
                            tokenType: 1, tokenModifiers: 1 // macro, readonly
                        });
                    }
                }
            }
        } else if (lineContent.startsWith('enum')) {
            // Semantic: enum keyword
            results.semanticTokens.push({
                line: lineIndex, char: originalLine.indexOf('enum'), length: 4,
                tokenType: 5, tokenModifiers: 0 // keyword
            });

            const enumNameMatch = lineContent.match(/^enum\s+(?:([A-Za-z_@][\w@:]*)\s*)?{?|enum\s+\([^)]+\)\s*{?/);
            const enumName = enumNameMatch?.[1];
            if (enumName && enumName !== '{') {
                const nameCol = originalLine.indexOf(enumName);
                results.semanticTokens.push({
                    line: lineIndex, char: nameCol, length: enumName.length,
                    tokenType: 6, tokenModifiers: 0 // type
                });
            }

            // Coleta linhas do enum até encontrar }
            if (!lineContent.includes('}')) {
                for (let ei = lineIndex + 1; ei < lines.length; ei++) {
                    const eline = lines[ei].trim().replace(/\/\/.*/, '').trim();
                    if (!eline) continue;

                    // Extrai valores do enum: suporta Tag:Identifier, Identifier[Size], Identifier = Value
                    const valueMatch = eline.match(/^(?:([A-Za-z_@][\w@]*):)?([A-Za-z_@][\w@]*)/);
                    if (valueMatch) {
                        const tagName = valueMatch[1];
                        const enumVal = valueMatch[2];

                        if (enumVal !== '}' && !pawnKeywords.includes(enumVal)) {
                            results.constants.push({
                                identifier: enumVal,
                                value: '',
                                label: `enum ${enumName || ''} { ..., ${tagName ? tagName + ':' : ''}${enumVal}, ... }`,
                                file: fileUri,
                                range: { start: { line: ei, character: 0 }, end: { line: ei, character: lines[ei].length } }
                            });

                            // Semantic: tag (se existir)
                            if (tagName) {
                                const tagCol = lines[ei].indexOf(tagName);
                                results.semanticTokens.push({
                                    line: ei, char: tagCol, length: tagName.length,
                                    tokenType: 6, tokenModifiers: 0 // type
                                });
                            }

                            // Semantic: enum member
                            const enumCol = lines[ei].indexOf(enumVal, tagName ? lines[ei].indexOf(':') : 0);
                            if (enumCol >= 0) {
                                results.semanticTokens.push({
                                    line: ei, char: enumCol, length: enumVal.length,
                                    tokenType: 3, tokenModifiers: 1 // enumMember, readonly
                                });
                            }
                        }
                    }

                    if (eline.includes('}')) {
                        lineIndex = ei;
                        break;
                    }
                }
            }
            docComment = "";
            continue; // Skip bracketDepth update — enum loop already consumed all braces
        } else {
            // Try multi-line signature join if line looks like start of a callable
            let effectiveLineContent = lineContent;
            let extraLinesConsumed = 0;
            if (callableStartRegex.test(lineContent) && !callableDefinitionRegex.test(lineContent)) {
                const joined = joinMultiLineSignature(lines, lineIndex);
                if (joined) {
                    effectiveLineContent = joined.joinedLine;
                    extraLinesConsumed = joined.linesConsumed;
                }
            }

            const callableMatch = effectiveLineContent.match(callableDefinitionRegex);
            if (callableMatch && callableMatch[2] !== 'enum') {
                const [, specifier, fullIdentifier, params] = callableMatch;
                const identifier = (fullIdentifier || '').split(':').pop() || '';
                if (!identifier) continue;

                const newCallable: Types.CallableDescriptor = {
                    label: callableMatch[0].trim(),
                    identifier, file: fileUri,
                    start: { line: lineIndex, character: originalLine.indexOf(identifier) },
                    end: { line: lineIndex, character: originalLine.indexOf(identifier) + identifier.length },
                    parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                    documentation: docComment.trim(),
                    isForward: specifier === 'forward' || specifier === 'native'
                };

                // Semantic: function declaration
                const fnCol = originalLine.indexOf(identifier);
                if (fnCol >= 0) {
                    let modifiers = 1; // declaration
                    if (specifier === 'static') modifiers |= 4; // static
                    results.semanticTokens.push({
                        line: lineIndex, char: fnCol, length: identifier.length,
                        tokenType: 0, tokenModifiers: modifiers // function
                    });
                }

                // --- Semantic: function parameter coloring ---
                if (params) {
                    const paramList = params.split(',');
                    const sigEndLine = lineIndex + (extraLinesConsumed || 0);
                    // Collect all signature lines
                    const sigLines: { text: string; ln: number }[] = [];
                    for (let sl = lineIndex; sl <= sigEndLine && sl < lines.length; sl++) {
                        sigLines.push({ text: lines[sl], ln: sl });
                    }
                    let searchLineIdx = 0;
                    let searchCol = sigLines[0].text.indexOf('(') + 1;
                    for (const paramStr of paramList) {
                        const paramName = extractParamName(paramStr.trim());
                        if (!paramName) continue;
                        for (let si = searchLineIdx; si < sigLines.length; si++) {
                            const from = si === searchLineIdx ? searchCol : 0;
                            const col = sigLines[si].text.indexOf(paramName, from);
                            if (col >= 0) {
                                const before = col > 0 ? sigLines[si].text[col - 1] : ' ';
                                const after = col + paramName.length < sigLines[si].text.length
                                    ? sigLines[si].text[col + paramName.length] : ' ';
                                if (!StringHelpers.isAlphaNum(before) && !StringHelpers.isAlphaNum(after)) {
                                    results.semanticTokens.push({
                                        line: sigLines[si].ln, char: col, length: paramName.length,
                                        tokenType: 4, tokenModifiers: 0 // parameter
                                    });
                                    searchLineIdx = si;
                                    searchCol = col + paramName.length;
                                    break;
                                }
                            }
                        }
                    }
                }

                // --- Track function scope for local variables ---
                currentFunctionStartLine = lineIndex;
                currentFunctionLocals = [];
                // Add params as local variables for completion
                if (params) {
                    for (const paramStr of params.split(',')) {
                        const pName = extractParamName(paramStr.trim());
                        if (pName && !pawnKeywords.includes(pName)) {
                            currentFunctionLocals.push({
                                identifier: pName, line: lineIndex,
                                col: 0, len: pName.length,
                                isConst: false, label: `(param) ${paramStr.trim()}`
                            });
                        }
                    }
                }

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

                // Skip the extra lines consumed by multi-line join
                if (extraLinesConsumed > 0) {
                    // Recount braces from the joined lines for bracketDepth
                    for (let skip = lineIndex + 1; skip <= lineIndex + extraLinesConsumed && skip < lines.length; skip++) {
                        const skipLine = lines[skip].trim().replace(/\/\/.*/, '').trim();
                        const skipNoStrings = skipLine.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
                        bracketDepth += (skipNoStrings.match(/{/g) || []).length - (skipNoStrings.match(/}/g) || []).length;
                    }
                    lineIndex += extraLinesConsumed;
                }
            } else {
                const varMatch = lineContent.match(globalVarRegex);
                if (varMatch) {
                    const identifier = (varMatch[2] || '').split(':').pop() || '';
                    const isConst = lineContent.includes('const');
                    const isStatic = varMatch[1] === 'static';
                    const tagName = varMatch[2].includes(':') ? varMatch[2].split(':')[0] : undefined;
                    if (tagName) {
                        const tagCol = originalLine.indexOf(tagName);
                        if (tagCol >= 0) {
                            results.semanticTokens.push({
                                line: lineIndex, char: tagCol, length: tagName.length,
                                tokenType: 6, tokenModifiers: 0 // type
                            });
                        }
                    }

                    if (identifier && !results.values.find(v => v.identifier === identifier)) {
                        results.values.push({
                            label: lineContent, identifier, isConst, file: fileUri,
                            range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length } },
                            documentation: docComment.trim()
                        });
                        // Semantic: variable declaration
                        const varCol = originalLine.indexOf(identifier);
                        if (varCol >= 0) {
                            let modifiers = 1; // declaration
                            if (isConst) modifiers |= 2; // readonly
                            if (isStatic) modifiers |= 4; // static
                            results.semanticTokens.push({
                                line: lineIndex, char: varCol, length: identifier.length,
                                tokenType: 2, tokenModifiers: modifiers // variable
                            });
                        }
                    }

                    // Multi-variable: new g_iReturn, g_PugState, g_Other
                    const restOfLine = lineContent.substring(lineContent.indexOf(identifier) + identifier.length);
                    const commaRest = restOfLine.replace(/\[.*?\]/g, '').trim();
                    if (commaRest.startsWith(',')) {
                        const extraVars = commaRest.split(',').slice(1);
                        for (const ev of extraVars) {
                            const evClean = ev.trim().replace(/\[.*/, '').replace(/=.*/, '').trim();
                            const evIdent = (evClean.split(':').pop() || '').trim();
                            const evTagName = evClean.includes(':') ? evClean.split(':')[0].trim() : undefined;
                            
                            if (evTagName) {
                                const tagCol = originalLine.indexOf(evTagName);
                                if (tagCol >= 0) {
                                    results.semanticTokens.push({
                                        line: lineIndex, char: tagCol, length: evTagName.length,
                                        tokenType: 6, tokenModifiers: 0 // type
                                    });
                                }
                            }

                            if (evIdent && /^[A-Za-z_@][\w@]*$/.test(evIdent) && !results.values.find(v => v.identifier === evIdent)) {
                                results.values.push({
                                    label: lineContent, identifier: evIdent, isConst, file: fileUri,
                                    range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length } },
                                    documentation: docComment.trim()
                                });
                                const evCol = originalLine.indexOf(evIdent);
                                if (evCol >= 0) {
                                    let evMod = 1;
                                    if (isConst) evMod |= 2;
                                    if (isStatic) evMod |= 4;
                                    results.semanticTokens.push({
                                        line: lineIndex, char: evCol, length: evIdent.length,
                                        tokenType: 2, tokenModifiers: evMod
                                    });
                                }
                            }
                        }
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
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>): VSCLS.Location | null {

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
    const textBeforeCursor = content.substring(0, cursorIndex);
    const match = textBeforeCursor.match(/[\w@]+$/);
    return match ? match[0] : '';
}

export function doCompletions(
    connection: VSCLS.Connection,
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>,
    includePaths: string[] = []
): VSCLS.CompletionItem[] | null {

    // --- Feature: Preprocessor directive completion ---
    const lines = content.split(/\r?\n/);
    const currentLine = lines[position.line] || '';
    const textBeforeCursor = currentLine.substring(0, position.character);
    if (/^\s*#\w*$/.test(textBeforeCursor.trimEnd())) {
        return preprocessorDirectives.map(d => ({
            label: d,
            kind: VSCLS.CompletionItemKind.Keyword,
            detail: `#${d}`,
            sortText: `0_${d}` // prioritize at top
        }));
    }

    // --- Feature: Include completion ---
    if (/^\s*#(?:try)?include\s*[<"]/.test(textBeforeCursor)) {
        const includeItems: VSCLS.CompletionItem[] = [];
        const includePathMatch = textBeforeCursor.match(/#(?:try)?include\s*([<"])([^>"]*)$/);
        
        if (includePathMatch) {
            const isLocal = includePathMatch[1] === '"';
            const addedSet = new Set<string>();

            const addFilesFromDir = (dir: string) => {
                if (!FS.existsSync(dir)) return;
                try {
                    const files = FS.readdirSync(dir);
                    for (const file of files) {
                        if (file.toLowerCase().endsWith('.inc')) {
                            const name = file.substring(0, file.length - 4);
                            if (!addedSet.has(name)) {
                                addedSet.add(name);
                                includeItems.push({
                                    label: name,
                                    kind: VSCLS.CompletionItemKind.File,
                                    detail: `${name}.inc`
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Ignore directory read errors
                }
            };

            for (const incPath of includePaths) {
                addFilesFromDir(incPath);
            }

            if (isLocal && data.uri) {
                try {
                    const docFsPath = URI.parse(data.uri).fsPath;
                    const docDir = Path.dirname(docFsPath);
                    addFilesFromDir(docDir);
                } catch (e) {
                    // Ignore URI parsing errors
                }
            }

            // Fallback for standard includes if none were found
            if (includeItems.length === 0) {
                const standardIncludes = [
                    'amxmisc', 'amxmodx', 'cstrike', 'engine', 'fakemeta', 'hamsandwich',
                    'fun', 'nvault', 'regex', 'sockets', 'sqlx', 'csx', 'xs', 'dhudmessage'
                ];
                for (const inc of standardIncludes) {
                    includeItems.push({
                        label: inc,
                        kind: VSCLS.CompletionItemKind.File,
                        detail: `${inc}.inc`
                    });
                }
            }
            
            return includeItems;
        }
    }

    const { values, callables, constants } = Helpers.getSymbols(data, dependenciesData);
    const allItems: VSCLS.CompletionItem[] = [];

    pawnKeywords.forEach(keyword => {
        allItems.push({ label: keyword, kind: VSCLS.CompletionItemKind.Keyword });
    });

    constants.forEach(c => {
        allItems.push({ label: c.identifier, detail: c.label, kind: VSCLS.CompletionItemKind.Constant });
    });

    values.forEach(v => {
        allItems.push({
            label: v.identifier,
            detail: v.label,
            kind: v.isConst ? VSCLS.CompletionItemKind.Constant : VSCLS.CompletionItemKind.Variable,
            insertText: v.identifier.startsWith('@') ? v.identifier.substring(1) : v.identifier,
            documentation: v.documentation
        });
    });

    callables.forEach(c => {
        allItems.push({
            label: c.identifier,
            detail: c.label,
            kind: VSCLS.CompletionItemKind.Function,
            insertText: c.identifier.startsWith('@') ? c.identifier.substring(1) : c.identifier,
            documentation: c.documentation
        });
    });

    // --- Feature: Local variable completion (scoped) ---
    const localVars = Helpers.getLocalVariables(data, dependenciesData);
    for (const lv of localVars) {
        if (position.line >= lv.scopeStartLine && position.line <= lv.scopeEndLine) {
            allItems.push({
                label: lv.identifier,
                detail: lv.label,
                kind: lv.isConst ? VSCLS.CompletionItemKind.Constant : VSCLS.CompletionItemKind.Variable,
                sortText: `0_${lv.identifier}` // prioritize locals
            });
        }
    }

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
    content: string, position: VSCLS.Position, data: Types.DocumentData, dependenciesData: Map<DM.FileDependency, Types.DocumentData>): VSCLS.Hover | null {
    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return null;
    const symbols = Helpers.getSymbols(data, dependenciesData);

    const constant = symbols.constants.find(c => c.identifier === result.identifier);
    if (constant) return { contents: [{ language: 'amxxpawn', value: constant.label }] };

    const idsToSearch = [result.identifier];
    if (result.identifier.startsWith('@')) idsToSearch.push(result.identifier.substring(1));
    else idsToSearch.push('@' + result.identifier);

    const callable = symbols.callables.find(c => idsToSearch.some(id => id.toLowerCase() === c.identifier.toLowerCase()));
    if (callable) {
        return { contents: [{ language: 'amxxpawn', value: callable.label }, { language: 'pawndoc', value: callable.documentation }] };
    }

    const value = symbols.values.find(v => idsToSearch.some(id => id.toLowerCase() === v.identifier.toLowerCase()));
    if (value && position.line !== value.range.start.line) {
        return { contents: [{ language: 'amxxpawn', value: value.label }, { language: 'pawndoc', value: value.documentation }] };
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
            documentation: callable.documentation
        }]
    };
}

export function doReferences(
    content: string, position: VSCLS.Position, documentUri: string,
    data: Types.DocumentData, dependenciesData: Map<DM.FileDependency, Types.DocumentData>
): VSCLS.Location[] {
    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return [];

    const locations: VSCLS.Location[] = [];
    const identifier = result.identifier;

    // Search in current document
    findIdentifierOccurrences(content, identifier, documentUri, locations);

    // Search in dependencies using cached parsed data instead of reading from disk
    for (const [dep, depData] of dependenciesData.entries()) {
        const depUri = dep.uri;

        // Search in callables (function definitions)
        for (const callable of depData.callables) {
            if (callable.identifier === identifier) {
                locations.push(VSCLS.Location.create(depUri, {
                    start: callable.start,
                    end: callable.end
                }));
            }
        }

        // Search in values (variables)
        for (const value of depData.values) {
            if (value.identifier === identifier) {
                locations.push(VSCLS.Location.create(depUri, value.range));
            }
        }

        // Search in constants
        for (const constant of depData.constants) {
            if (constant.identifier === identifier) {
                locations.push(VSCLS.Location.create(depUri, constant.range));
            }
        }

        // Also do a full text search in the dependency content for occurrences
        // (for references that are not definitions, e.g., function calls)
        // (for references that are not definitions, e.g., function calls)
        try {
            const depFsPath = URI.parse(depUri).fsPath;
            if (FS.existsSync(depFsPath)) {
                const depContent = FS.readFileSync(depFsPath, 'utf8');
                findIdentifierOccurrences(depContent, identifier, depUri, locations);
            }
        } catch (e) {
            // ignore
        }
    }

    return locations;
}

function findIdentifierOccurrences(content: string, identifier: string, uri: string, locations: VSCLS.Location[]) {
    const lines = content.split(/\r?\n/);
    const escapedId = identifier.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const regex = new RegExp(`\\\\b${escapedId}\\\\b`, 'g');
    
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        if (inBlockComment) {
            const endIdx = line.indexOf('*/');
            if (endIdx >= 0) {
                inBlockComment = false;
                line = ' '.repeat(endIdx + 2) + line.substring(endIdx + 2);
            } else {
                continue;
            }
        }
        
        while (line.includes('/*')) {
            const startIdx = line.indexOf('/*');
            const endIdx = line.indexOf('*/', startIdx + 2);
            if (endIdx >= 0) {
                line = line.substring(0, startIdx) + ' '.repeat(endIdx + 2 - startIdx) + line.substring(endIdx + 2);
            } else {
                inBlockComment = true;
                line = line.substring(0, startIdx) + ' '.repeat(line.length - startIdx);
                break;
            }
        }

        let cleanLine = line.replace(/\/\/.*/, match => ' '.repeat(match.length));
        cleanLine = cleanLine.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, match => ' '.repeat(match.length));
        cleanLine = cleanLine.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, match => ' '.repeat(match.length));

        let match;
        while ((match = regex.exec(cleanLine)) !== null) {
            locations.push(VSCLS.Location.create(uri, {
                start: { line: i, character: match.index },
                end: { line: i, character: match.index + identifier.length }
            }));
        }
    }
}

export function getUsageTokens(
    content: string, 
    data: Types.DocumentData, 
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>
): Types.SemanticToken[] {
    const tokens: Types.SemanticToken[] = [];
    const symbols = Helpers.getSymbols(data, dependenciesData);
    
    const symbolMap = new Map<string, { type: number, modifier: number }>();
    
    for (const c of symbols.callables) symbolMap.set(c.identifier, { type: 0, modifier: 0 });
    for (const v of symbols.values) symbolMap.set(v.identifier, { type: 2, modifier: v.isConst ? 2 : 0 });
    for (const c of symbols.constants) {
        if (c.label.startsWith('#define')) {
            symbolMap.set(c.identifier, { type: 1, modifier: 1 }); // macro, readonly
        } else if (c.label.startsWith('enum')) {
            symbolMap.set(c.identifier, { type: 3, modifier: 1 }); // enumMember, readonly
        } else {
            symbolMap.set(c.identifier, { type: 2, modifier: 1 }); // variable, readonly
        }
    }

    const lines = content.split('\n');
    let inBlockComment = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        let line = lines[lineIndex];
        
        if (inBlockComment) {
            const endIdx = line.indexOf('*/');
            if (endIdx >= 0) {
                inBlockComment = false;
                line = ' '.repeat(endIdx + 2) + line.substring(endIdx + 2);
            } else {
                continue;
            }
        }
        
        while (line.includes('/*')) {
            const startIdx = line.indexOf('/*');
            const endIdx = line.indexOf('*/', startIdx + 2);
            if (endIdx >= 0) {
                line = line.substring(0, startIdx) + ' '.repeat(endIdx + 2 - startIdx) + line.substring(endIdx + 2);
            } else {
                inBlockComment = true;
                line = line.substring(0, startIdx) + ' '.repeat(line.length - startIdx);
                break;
            }
        }

        let cleanLine = line.replace(/\/\/.*/, match => ' '.repeat(match.length));
        cleanLine = cleanLine.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, match => ' '.repeat(match.length));
        cleanLine = cleanLine.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, match => ' '.repeat(match.length));

        // --- Feature: Highlight tags (Identifier:) as types ---
        const tagRegex = /([A-Za-z_@][\w@]*):/g;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(cleanLine)) !== null) {
            const tagName = tagMatch[1];
            const char = tagMatch.index;
            
            const existing = data.semanticTokens.find(t => t.line === lineIndex && t.char === char);
            if (existing) continue;

            tokens.push({
                line: lineIndex, char, length: tagName.length,
                tokenType: 6, tokenModifiers: 0 // type
            });
        }

        const regex = /\b[A-Za-z_@][\w@]*\b/g;
        let match;
        while ((match = regex.exec(cleanLine)) !== null) {
            const ident = match[0];
            const char = match.index;
            
            // Skip keywords (handled by TextMate), but we ALREADY handled tags above
            if (pawnKeywords.includes(ident)) continue;
            
            const existing = data.semanticTokens.find(t => t.line === lineIndex && t.char === char) ||
                             tokens.find(t => t.line === lineIndex && t.char === char);
            if (existing) continue;

            const localVars = data.localVariables.filter(lv => lv.scopeStartLine <= lineIndex && lv.scopeEndLine >= lineIndex);
            const localVar = localVars.find(lv => lv.identifier === ident);
            if (localVar) {
                const isParam = localVar.label.startsWith('(param)');
                tokens.push({
                    line: lineIndex, char, length: ident.length,
                    tokenType: isParam ? 4 : 2, tokenModifiers: localVar.isConst ? 2 : 0
                });
                continue;
            }

            const sym = symbolMap.get(ident);
            if (sym) {
                tokens.push({
                    line: lineIndex, char, length: ident.length,
                    tokenType: sym.type, tokenModifiers: sym.modifier
                });
            }
        }
    }
    return tokens;
}


export function doPrepareRename(
    content: string, position: VSCLS.Position
): { range: VSCLS.Range; placeholder: string } | null {
    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return null;

    // Don't allow renaming keywords
    if (pawnKeywords.includes(result.identifier)) return null;

    // Find exact start/end on the line
    const lines = content.split(/\r?\n/);
    const line = lines[position.line];
    const escapedId = result.identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\w@])${escapedId}(?![\\w@])`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
        if (position.character >= match.index && position.character <= match.index + result.identifier.length) {
            return {
                range: {
                    start: { line: position.line, character: match.index },
                    end: { line: position.line, character: match.index + result.identifier.length }
                },
                placeholder: result.identifier
            };
        }
    }

    return null;
}

export function doRename(
    content: string, position: VSCLS.Position, newName: string, documentUri: string
): VSCLS.TextEdit[] {
    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return [];

    if (pawnKeywords.includes(result.identifier)) return [];

    const edits: VSCLS.TextEdit[] = [];
    const identifier = result.identifier;
    const escapedId = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lines = content.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

        const noStrings = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

        let match: RegExpExecArray | null;
        const lineRegex = new RegExp(`(?<![\\w@])${escapedId}(?![\\w@])`, 'g');
        while ((match = lineRegex.exec(noStrings)) !== null) {
            edits.push(VSCLS.TextEdit.replace(
                {
                    start: { line: lineIndex, character: match.index },
                    end: { line: lineIndex, character: match.index + identifier.length }
                },
                newName
            ));
        }
    }

    return edits;
}