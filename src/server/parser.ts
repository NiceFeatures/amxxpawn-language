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
    currentParamText?: string;
    isMacro?: boolean;
    openParenPos?: number;
}

const callableDefinitionRegex = /^\s*(?:(forward|native|public|static|stock)\s+)?([A-Za-z_@][\w@:]*)\s*\(([^)]*)\)/;
const callableStartRegex = /^\s*(?:(?:forward|native|public|static|stock)\s+)?[A-Za-z_@][\w@:]*\s*\(/;
const defineRegex = /^#define\s+([A-Za-z_@][\w@]*)(?:\(([^)]*)\))?\s*(.*)/;
const globalVarRegex = /^\s*(new|static|const|public|stock)\b/;
const localVarRegex = /^\s*(?:new|static|const|stock)\b/;
const localVarDeclRegex = /\b(?:new|static|const|stock)\b(?:\s+(?:new|static|const|stock)\b)*/;
const enumRegex = /^\s*enum\s+(?:[A-Za-z_@][\w@:]*\s*)?{/;

function stripStrings(line: string): string {
    let result = '';
    let inString = false;
    let quote = '';
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inString) {
            if (char === quote && (i === 0 || line[i - 1] !== '\\')) {
                inString = false;
                result += char;
            } else {
                result += ' ';
            }
        } else {
            if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
                inString = true;
                quote = char;
            }
            result += char;
        }
    }
    return result;
}

function splitByCommaRespectingStrings(text: string): string[] {
    const segments: string[] = [];
    let currentSeg = '';
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && (i === 0 || text[i - 1] !== '\\')) inString = !inString;
        if (char === ',' && !inString) {
            segments.push(currentSeg);
            currentSeg = '';
        } else {
            currentSeg += char;
        }
    }
    segments.push(currentSeg);
    return segments;
}
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
    'enum', 'bool', 'break', 'continue', 'sizeof', 'defined', 'true', 'false'
];

function stripComments(line: string, keepLength: boolean = false): string {
    let result = '';
    let inString = false;
    let quote = '';
    let inBlock = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inBlock) {
            if (char === '*' && nextChar === '/') {
                inBlock = false;
                i++; // skip /
                if (keepLength) result += '  ';
            } else {
                if (keepLength) result += ' ';
            }
            continue;
        }

        if (inString) {
            result += char;
            if (char === quote && (i === 0 || line[i - 1] !== '\\')) {
                inString = false;
            }
            continue;
        }

        if (char === '/' && nextChar === '/') {
            if (keepLength) result += ' '.repeat(line.length - i);
            break;
        }

        if (char === '/' && nextChar === '*') {
            inBlock = true;
            i++; // skip *
            if (keepLength) result += '  ';
            continue;
        }

        if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
            inString = true;
            quote = char;
        }

        result += char;
    }

    return keepLength ? result : result.trim();
}

interface JoinedSignature {
    joinedLine: string;
    linesConsumed: number;
}

function joinMultiLineSignature(lines: string[], startIndex: number): JoinedSignature | null {
    const firstLine = stripComments(lines[startIndex]);
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
        const nextLine = stripComments(lines[i]);
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

function findIdentifierAtCursor(content: string, cursorIndex: number): { identifier: string; isCallable: boolean; isTag: boolean } {
    const result = { identifier: '', isCallable: false, isTag: false };
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
    if (checkParen < content.length && content[checkParen] === ':') {
        result.isTag = true;
    }
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
    let currentVarDecl: { isGlobal: boolean; isConst: boolean; isStatic: boolean; isPublic: boolean; isStock: boolean; } | null = null;
    let inBlockComment = false;
    let lineContentForBraces = "";

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const originalLine = lines[lineIndex];
        const trimmedLine = originalLine.trim();

        // Handle multi-line block comments /* ... */
        if (inBlockComment) {
            if (trimmedLine.includes('*/')) {
                inBlockComment = false;
                const endIdx = originalLine.indexOf('*/');
                // The part after */ should be processed
                const afterComment = originalLine.substring(endIdx + 2);
                lineContentForBraces = stripComments(afterComment, true);
                const commentPart = originalLine.substring(0, endIdx).replace(/^\s*\*/, '').trim();
                if (commentPart) docComment += commentPart + '\n';
            } else {
                const commentPart = originalLine.replace(/^\s*\*/, '').trim();
                if (commentPart) docComment += commentPart + '\n';
                continue; // Entire line is inside block comment
            }
        } else if (trimmedLine.startsWith('/*') && !trimmedLine.startsWith('/**')) {
            if (!trimmedLine.includes('*/')) {
                inBlockComment = true;
                const commentPart = trimmedLine.substring(2).replace(/^\s*\*/, '').trim();
                if (commentPart) docComment += commentPart + '\n';
                continue;
            }
            // Single-line block comment: stripComments below will handle it
            lineContentForBraces = stripComments(originalLine, true);
            const startIdx = originalLine.indexOf('/*');
            const endIdx = originalLine.indexOf('*/');
            const commentPart = originalLine.substring(startIdx + 2, endIdx).trim();
            if (commentPart) docComment += commentPart + '\n';
        } else {
            lineContentForBraces = stripComments(originalLine, true);
            if (trimmedLine.startsWith('//')) {
                const commentPart = trimmedLine.substring(2).trim();
                if (commentPart) docComment += commentPart + '\n';
            }
        }

        const lineContent = lineContentForBraces;
        const trimmedContent = lineContent.trim();

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

        if (!trimmedContent) {
            if (!trimmedLine.includes('*/') && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('/*')) {
                docComment = "";
            }
            continue;
        }

        // Remove strings to avoid counting braces inside them (handles escaped quotes)
        const noStrings = lineContent.replace(/"(?:[^"\\]|\\.)*"/g, '').replace(/'(?:[^'\\]|\\.)*'/g, '');
        const openBraces = (noStrings.match(/{/g) || []).length;
        const closeBraces = (noStrings.match(/}/g) || []).length;
        if (bracketDepth > 0) {
            // --- Parse local variable declarations inside function bodies ---
            if (currentFunctionStartLine >= 0) {
                const lineWithoutStrings = stripStrings(lineContent);
                const declMatch = lineWithoutStrings.match(localVarDeclRegex);
                const isDeclStart = declMatch !== null;
                if (isDeclStart || (currentVarDecl && !currentVarDecl.isGlobal)) {
                    if (isDeclStart && declMatch) {
                        currentVarDecl = {
                            isGlobal: false,
                            isConst: declMatch[0].includes('const'),
                            isStatic: declMatch[0].includes('static'),
                            isPublic: false,
                            isStock: declMatch[0].includes('stock')
                        };
                    }

                    let declPart = lineContent;
                    if (isDeclStart && declMatch) {
                        declPart = lineContent.substring(declMatch.index! + declMatch[0].length);
                    }

                    if (!/^\s*(?:new|static|const|stock|\s)+$/.test(lineContent)) {
                        const segments = splitByCommaRespectingStrings(declPart);

                        let searchPos = originalLine.indexOf(lineContent);
                        if (isDeclStart && declMatch) {
                            searchPos += declMatch.index! + declMatch[0].length;
                        }

                        for (const seg of segments) {
                            const trimmedSeg = seg.trim();
                            if (!trimmedSeg) continue;
                            const identMatch = trimmedSeg.match(/^(?:([A-Za-z_@][\w@]*):)?([A-Za-z_@][\w@]*)/);
                            if (identMatch) {
                                const tagName = identMatch[1];
                                const varName = identMatch[2];
                                if (!pawnKeywords.includes(varName)) {
                                    if (tagName) {
                                        const tagCol = originalLine.indexOf(tagName, searchPos);
                                        if (tagCol >= 0) {
                                            results.semanticTokens.push({
                                                line: lineIndex, char: tagCol, length: tagName.length,
                                                tokenType: 6, tokenModifiers: 0 // type
                                            });
                                        }
                                    }
                                    const varCol = originalLine.indexOf(varName, searchPos);
                                    if (varCol >= 0) {
                                        searchPos = varCol + varName.length;
                                        const prefix: string[] = [];
                                        if (currentVarDecl!.isStatic) prefix.push('static');
                                        if (prefix.length === 0) prefix.push('new');
                                        if (currentVarDecl!.isConst) prefix.push('const');
                                        
                                        const varCleanLabel = prefix.join(' ') + ' ' + trimmedSeg.split('=')[0].trim();
                                        currentFunctionLocals.push({
                                            identifier: varName, line: lineIndex,
                                            col: varCol, len: varName.length,
                                            isConst: currentVarDecl!.isConst, label: varCleanLabel
                                        });
                                        let modifiers = 1; // declaration
                                        if (currentVarDecl!.isConst) modifiers |= 2; // readonly
                                        if (currentVarDecl!.isStatic) modifiers |= 4; // static
                                        results.semanticTokens.push({
                                            line: lineIndex, char: varCol, length: varName.length,
                                            tokenType: 2, tokenModifiers: modifiers // variable
                                        });
                                    }
                                }
                            }
                        }
                    }

                    if (lineContent.includes(';') || (!lineContent.endsWith(',') && !lineContent.endsWith('\\') && !/^\s*(?:new|static|const|stock|\s)+$/.test(lineContent))) {
                        currentVarDecl = null;
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

        if (trimmedContent.startsWith('#include') || trimmedContent.startsWith('#tryinclude')) {
            const match = lineContent.match(/#\s*(?:try)?include\s*(?:<|")\s*(.+?)\s*(?:>|")/);
            if (match?.[1]) {
                results.headerInclusions.push({
                    filename: match[1], isLocal: lineContent.includes('"'), isSilent: trimmedContent.startsWith('#tryinclude'),
                    start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length }
                });

                // Semantic: #include keyword
                const keyword = trimmedContent.startsWith('#tryinclude') ? '#tryinclude' : '#include';
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
        } else if (trimmedContent.startsWith('#define')) {
            const match = lineContent.match(defineRegex);
            if (match) {
                const [, identifier, params, value] = match;
                if (params !== undefined) {
                    const searchPos = originalLine.indexOf('#define') + 7;
                    results.callables.push({
                        label: lineContent, identifier, file: fileUri,
                        start: { line: lineIndex, character: originalLine.indexOf(identifier, searchPos) },
                        end: { line: lineIndex, character: originalLine.indexOf(identifier, searchPos) + identifier.length },
                        parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                        documentation: `Macro: ${lineContent}`, isForward: false
                    });
                    // Semantic: macro declaration
                    const macroCol = originalLine.indexOf(identifier, searchPos);
                    if (macroCol >= 0) {
                        results.semanticTokens.push({
                            line: lineIndex, char: macroCol, length: identifier.length,
                            tokenType: 1, tokenModifiers: 1 // macro, readonly
                        });
                    }
                } else {
                    const searchPos = originalLine.indexOf('#define') + 7;
                    results.constants.push({
                        identifier, value: value.trim(), label: `#define ${identifier} ${value.trim()}`, file: fileUri,
                        range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: originalLine.length } }
                    });
                    // Semantic: constant (readonly)
                    const constCol = originalLine.indexOf(identifier, searchPos);
                    if (constCol >= 0) {
                        results.semanticTokens.push({
                            line: lineIndex, char: constCol, length: identifier.length,
                            tokenType: 1, tokenModifiers: 1 // macro, readonly
                        });
                    }
                }
            }
        } else if (trimmedContent.startsWith('enum')) {
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
                    const eline = stripComments(lines[ei]);
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

                let searchPos = originalLine.indexOf(lineContent);
                if (specifier) {
                    searchPos = originalLine.indexOf(specifier, searchPos) + specifier.length;
                }
                const fnCol = originalLine.indexOf(identifier, searchPos);

                const newCallable: Types.CallableDescriptor = {
                    label: callableMatch[0].trim(),
                    identifier, file: fileUri,
                    start: { line: lineIndex, character: fnCol },
                    end: { line: lineIndex, character: fnCol + identifier.length },
                    parameters: params ? params.split(',').map(p => ({ label: p.trim() })) : [],
                    documentation: docComment.trim(),
                    isForward: specifier === 'forward' || specifier === 'native'
                };

                // Semantic: function declaration
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
                        const skipLine = stripComments(lines[skip]);
                        const skipNoStrings = skipLine.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
                        bracketDepth += (skipNoStrings.match(/{/g) || []).length - (skipNoStrings.match(/}/g) || []).length;
                    }
                    lineIndex += extraLinesConsumed;
                }
            } else {
                const isDeclStart = globalVarRegex.test(lineContent);
                if (isDeclStart || (currentVarDecl && currentVarDecl.isGlobal)) {
                    if (isDeclStart) {
                        currentVarDecl = {
                            isGlobal: true,
                            isConst: lineContent.includes('const'),
                            isStatic: lineContent.includes('static'),
                            isPublic: lineContent.includes('public'),
                            isStock: lineContent.includes('stock')
                        };
                    }

                    let declPart = lineContent;
                    if (isDeclStart) {
                        declPart = lineContent.replace(/^\s*(?:(?:new|static|const|public|stock)\s+)+/, '');
                    }

                    if (!/^\s*(?:new|static|const|public|stock|\s)+$/.test(lineContent)) {
                        // Split by comma but respect strings
                        const segments: string[] = [];
                        let currentSeg = '';
                        let inString = false;
                        for (let i = 0; i < declPart.length; i++) {
                            const char = declPart[i];
                            if (char === '"' && (i === 0 || declPart[i - 1] !== '\\')) inString = !inString;
                            if (char === ',' && !inString) {
                                segments.push(currentSeg);
                                currentSeg = '';
                            } else {
                                currentSeg += char;
                            }
                        }
                        segments.push(currentSeg);

                        let searchPos = originalLine.indexOf(lineContent);
                        if (isDeclStart) {
                            const modMatch = lineContent.match(/^\s*(?:(?:new|static|const|public|stock)\s+)+/);
                            if (modMatch) {
                                searchPos += modMatch[0].length;
                            }
                        }

                        for (const seg of segments) {
                            const trimmedSeg = seg.trim();
                            if (!trimmedSeg) continue;
                            const identMatch = trimmedSeg.match(/^(?:([A-Za-z_@][\w@]*):)?([A-Za-z_@][\w@]*)/);
                            if (identMatch) {
                                const tagName = identMatch[1];
                                const varName = identMatch[2];
                                if (!pawnKeywords.includes(varName) && !results.values.find(v => v.identifier === varName)) {
                                    if (tagName) {
                                        const tagCol = originalLine.indexOf(tagName, searchPos);
                                        if (tagCol >= 0) {
                                            results.semanticTokens.push({
                                                line: lineIndex, char: tagCol, length: tagName.length,
                                                tokenType: 6, tokenModifiers: 0 // type
                                            });
                                        }
                                    }
                                    const varCol = originalLine.indexOf(varName, searchPos);
                                    if (varCol >= 0) {
                                        searchPos = varCol + varName.length;
                                        const prefix: string[] = [];
                                        if (currentVarDecl!.isStock) prefix.push('stock');
                                        if (currentVarDecl!.isStatic) prefix.push('static');
                                        if (currentVarDecl!.isPublic) prefix.push('public');
                                        if (prefix.length === 0) prefix.push('new');
                                        if (currentVarDecl!.isConst) prefix.push('const');

                                        const varCleanLabel = prefix.join(' ') + ' ' + trimmedSeg.split('=')[0].trim();
                                        results.values.push({
                                            label: varCleanLabel, identifier: varName, isConst: currentVarDecl!.isConst, file: fileUri,
                                            range: { start: { line: lineIndex, character: varCol }, end: { line: lineIndex, character: varCol + varName.length } },
                                            documentation: docComment.trim()
                                        });
                                        let modifiers = 1; // declaration
                                        if (currentVarDecl!.isConst) modifiers |= 2; // readonly
                                        if (currentVarDecl!.isStatic) modifiers |= 4; // static
                                        results.semanticTokens.push({
                                            line: lineIndex, char: varCol, length: varName.length,
                                            tokenType: 2, tokenModifiers: modifiers // variable
                                        });
                                    }
                                }
                            }
                        }
                    }

                    if (lineContent.includes(';') || (!lineContent.endsWith(',') && !lineContent.endsWith('\\') && !/^\s*(?:new|static|const|public|stock|\s)+$/.test(lineContent))) {
                        currentVarDecl = null;
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

    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);
    if (!result.identifier) return null;

    if (pawnKeywords.includes(result.identifier)) return null;

    const identifierLower = result.identifier.toLowerCase();

    // Check local variables first (they shadow globals)
    const localVars = data.localVariables;
    const localVar = localVars.find(lv => lv.identifier === result.identifier && position.line >= lv.scopeStartLine && position.line <= lv.scopeEndLine);
    if (localVar) {
        if (position.line === localVar.range.start.line) return null;
        return VSCLS.Location.create(localVar.file.toString(), localVar.range);
    }

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

    const potentialIdentifiers = [result.identifier];
    if (result.identifier.startsWith('@')) potentialIdentifiers.push(result.identifier.substring(1));
    else potentialIdentifiers.push('@' + result.identifier);

    // 1. Check variables (values) first - high priority
    const value = symbols.values.find(val => potentialIdentifiers.some(id => id.toLowerCase() === val.identifier.toLowerCase()));
    if (value) {
        if (data.uri === value.file.toString() && position.line === value.range.start.line) return null;
        return VSCLS.Location.create(value.file.toString(), value.range);
    }

    // 2. Check callables
    const callable = symbols.callables.find(clb => potentialIdentifiers.some(id => id.toLowerCase() === clb.identifier.toLowerCase()));
    if (callable) {
        if (data.uri === callable.file.toString() && position.line === callable.start.line) return null;
        return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
    }

    // 3. Check constants last
    const constant = symbols.constants.find(c => c.identifier.toLowerCase() === identifierLower);
    if (constant) {
        if (data.uri === constant.file.toString() && position.line === constant.range.start.line) return null;
        return VSCLS.Location.create(constant.file.toString(), constant.range);
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

function findFunctionIdentifier(content: string, cursorIndex: number, startSearchFrom?: number): FindFunctionIdentifierResult {
    let searchIndex = (startSearchFrom ?? cursorIndex) - 1;
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
                let forwardParenDepth = 0;
                let inString = false;
                let inChar = false;
                let currentParamStart = openParenPos + 1;

                for (let i = openParenPos + 1; i < cursorIndex; i++) {
                    const c = content[i];
                    if (inString) {
                        if (c === '"' && content[i - 1] !== '\\') inString = false;
                    } else if (inChar) {
                        if (c === "'" && content[i - 1] !== '\\') inChar = false;
                    } else {
                        if (c === '"') inString = true;
                        else if (c === "'") inChar = true;
                        else if (c === '(') forwardParenDepth++;
                        else if (c === ')') forwardParenDepth--;
                        else if (c === ',' && forwardParenDepth === 0) {
                            parameterIndex++;
                            currentParamStart = i + 1;
                        }
                    }
                }

                const currentParamText = content.substring(currentParamStart, cursorIndex);

                return { identifier, parameterIndex, currentParamText, openParenPos };
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

    if (pawnKeywords.includes(result.identifier)) return null;

    // Check local variables first (they shadow globals)
    const localVars = data.localVariables;
    const localVar = localVars.find(lv => lv.identifier === result.identifier && position.line >= lv.scopeStartLine && position.line <= lv.scopeEndLine);
    if (localVar) {
        return { contents: [{ language: 'amxxpawn', value: localVar.label }] };
    }

    const symbols = Helpers.getSymbols(data, dependenciesData);

    const idsToSearch = [result.identifier];
    if (result.identifier.startsWith('@')) idsToSearch.push(result.identifier.substring(1));
    else idsToSearch.push('@' + result.identifier);

    // Check if it's a tag (e.g. Float:)
    if (result.isTag) {
        return { contents: [{ language: 'amxxpawn', value: `(tag) ${result.identifier}:` }] };
    }

    // 1. Check variables (values) - high priority
    let value = symbols.values.find(v => idsToSearch.some(id => id === v.identifier));
    if (!value) {
        value = symbols.values.find(v => idsToSearch.some(id => id.toLowerCase() === v.identifier.toLowerCase()));
    }
    if (value) {
        // Skip hover if on the declaration line in the same file
        if (data.uri === value.file.toString() && position.line === value.range.start.line) return null;
        return { contents: [{ language: 'amxxpawn', value: value.label }, { language: 'pawndoc', value: value.documentation }] };
    }

    // 2. Check callables
    let callable = symbols.callables.find(c => idsToSearch.some(id => id === c.identifier));
    if (!callable) {
        callable = symbols.callables.find(c => idsToSearch.some(id => id.toLowerCase() === c.identifier.toLowerCase()));
    }
    if (callable) {
        return { contents: [{ language: 'amxxpawn', value: callable.label }, { language: 'pawndoc', value: callable.documentation }] };
    }

    // 3. Check constants
    let constant = symbols.constants.find(c => idsToSearch.some(id => id === c.identifier));
    if (!constant) {
        constant = symbols.constants.find(c => idsToSearch.some(id => id.toLowerCase() === c.identifier.toLowerCase()));
    }
    if (constant) return { contents: [{ language: 'amxxpawn', value: constant.label }] };

    return null;
}

export function doSignatures(content: string, position: VSCLS.Position, callables: Types.CallableDescriptor[]): VSCLS.SignatureHelp | null {
    const cursorIndex = positionToIndex(content, position);

    // Walk outward from cursor, skipping macro (#define) callables to find
    // the nearest enclosing non-macro function — matches clangd behavior.
    let searchFrom: number | undefined = undefined;
    let result = findFunctionIdentifier(content, cursorIndex, searchFrom);

    let callable: Types.CallableDescriptor | undefined;
    const MAX_OUTER_SEARCH = 10;
    let attempts = 0;

    while (result.identifier && attempts < MAX_OUTER_SEARCH) {
        attempts++;
        const found = callables.find(c => c.identifier.toLowerCase() === result.identifier.toLowerCase());

        if (!found) {
            // Unknown function — go one level out
            if (result.openParenPos !== undefined) {
                searchFrom = result.openParenPos;
                result = findFunctionIdentifier(content, cursorIndex, searchFrom);
            } else {
                break;
            }
            continue;
        }

        // If the found callable is a #define macro, skip it and look outward
        const isMacro = found.label.trimStart().startsWith('#define');
        if (isMacro) {
            if (result.openParenPos !== undefined) {
                searchFrom = result.openParenPos;
                result = findFunctionIdentifier(content, cursorIndex, searchFrom);
            } else {
                break;
            }
            continue;
        }

        callable = found;
        break;
    }

    if (!callable) {
        return null;
    }

    let activeParameter = result.parameterIndex || 0;

    if (result.currentParamText && result.currentParamText.trim().startsWith('.')) {
        const paramNameMatch = result.currentParamText.match(/\.(\w+)/);
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
            }
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

    // Determine if the identifier is a callable (function/callback)
    let isCallable = result.isCallable;
    if (!isCallable) {
        if (identifier.startsWith('@') || identifier.startsWith('public ')) {
            isCallable = true;
        } else {
            for (const callable of data.callables) {
                if (callable.identifier === identifier) {
                    isCallable = true;
                    break;
                }
            }
            if (!isCallable) {
                for (const depData of dependenciesData.values()) {
                    for (const callable of depData.callables) {
                        if (callable.identifier === identifier) {
                            isCallable = true;
                            break;
                        }
                    }
                    if (isCallable) break;
                }
            }
        }
    }

    // Search all occurrences in the current document
    findIdentifierOccurrences(content, identifier, documentUri, locations, isCallable);

    // Search all occurrences in dependency files (includes)
    for (const [dep] of dependenciesData.entries()) {
        const depUri = dep.uri;
        try {
            const depFsPath = URI.parse(depUri).fsPath;
            if (FS.existsSync(depFsPath)) {
                const depContent = FS.readFileSync(depFsPath, 'utf8');
                findIdentifierOccurrences(depContent, identifier, depUri, locations, isCallable);
            }
        } catch (e) {
            // ignore read errors
        }
    }

    // Deduplicate locations by URI + start position
    const seen = new Set<string>();
    const unique: VSCLS.Location[] = [];
    for (const loc of locations) {
        const key = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(loc);
        }
    }

    return unique;
}


function findIdentifierOccurrences(content: string, identifier: string, uri: string, locations: VSCLS.Location[], searchInStrings: boolean = false) {
    const lines = content.split(/\r?\n/);
    const escapedId = identifier.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const regex = new RegExp(`(?<![a-zA-Z0-9_@])${escapedId}(?![a-zA-Z0-9_@])`, 'g');
    
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
        
        // Only strip strings if we are NOT searching for a callable/callback.
        // Pawn heavily uses string-based callbacks (e.g. set_task(1.0, "@MyTask")).
        if (!searchInStrings) {
            cleanLine = cleanLine.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, match => ' '.repeat(match.length));
            cleanLine = cleanLine.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, match => ' '.repeat(match.length));
        }

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
    
    // Build a set of value identifiers for priority resolution:
    // 'new const' variables go into values (type 2), NOT constants (type 3)
    const valueIdentifiers = new Set<string>();
    for (const v of symbols.values) valueIdentifiers.add(v.identifier);

    for (const c of symbols.callables) symbolMap.set(c.identifier, { type: 0, modifier: 0 });
    for (const c of symbols.constants) {
        // Skip constants that also exist as values — values take priority
        // This prevents 'new const' variables from being classified as enumMember
        if (valueIdentifiers.has(c.identifier)) continue;
        if (c.label.startsWith('#define')) {
            symbolMap.set(c.identifier, { type: 1, modifier: 1 }); // macro, readonly
        } else if (c.label.startsWith('enum')) {
            symbolMap.set(c.identifier, { type: 3, modifier: 1 }); // enumMember, readonly
        } else {
            symbolMap.set(c.identifier, { type: 2, modifier: 1 }); // variable, readonly
        }
    }
    // Values MUST be set last to ensure they always win over constants
    for (const v of symbols.values) symbolMap.set(v.identifier, { type: 2, modifier: v.isConst ? 2 : 0 });

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

        let cleanLine = stripComments(line, true);
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
    const lineRegex = new RegExp(`(?<![\\w@])${escapedId}(?![\\w@])`, 'g');

    let inBlockComment = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const trimmed = line.trim();

        if (inBlockComment) {
            if (trimmed.includes('*/')) {
                inBlockComment = false;
            }
            continue;
        }
        if (trimmed.startsWith('//')) continue;
        if (trimmed.startsWith('/*')) {
            if (!trimmed.includes('*/')) {
                inBlockComment = true;
            }
            continue;
        }

        const noStrings = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

        let match: RegExpExecArray | null;
        lineRegex.lastIndex = 0;
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