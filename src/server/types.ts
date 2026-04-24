'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as DM from './dependency-manager';
import { URI } from 'vscode-uri';

export interface InclusionDescriptor {
    filename: string;
    isLocal: boolean;
    isSilent: boolean;
    start: VSCLS.Position;
    end: VSCLS.Position;
}

export interface ResolvedInclusion {
    descriptor: InclusionDescriptor;
    uri: string;
}

export interface CallableDescriptor {
    label: string;
    identifier: string;
    file: URI;
    start: VSCLS.Position;
    end: VSCLS.Position;
    parameters: VSCLS.ParameterInformation[];
    documentation: string;
    isForward: boolean;
}

export interface ValueDescriptor {
    label: string;
    identifier: string;
    isConst: boolean;
    file: URI;
    range: VSCLS.Range;
    documentation: string;
}

export interface ConstantDescriptor {
    label: string;
    identifier: string;
    value: string;
    file: URI;
    range: VSCLS.Range;
}

// --- Semantic Tokens ---
export const SemanticTokenTypes = [
    'function',     // 0
    'macro',        // 1
    'variable',     // 2
    'enumMember',   // 3
    'parameter',    // 4
    'keyword',      // 5
    'type',         // 6
    'string',       // 7
] as const;

export const SemanticTokenModifiers = [
    'declaration',  // 0
    'readonly',     // 1
    'static',       // 2
    'definition',   // 3
] as const;

export interface SemanticToken {
    line: number;
    char: number;
    length: number;
    tokenType: number;
    tokenModifiers: number;
}

export interface LocalVariableDescriptor {
    identifier: string;
    file: URI;
    range: VSCLS.Range;
    scopeStartLine: number;
    scopeEndLine: number;
    isConst: boolean;
    label: string;
}

export class ParserResults {
    public headerInclusions: InclusionDescriptor[] = [];
    public callables: CallableDescriptor[] = [];
    public values: ValueDescriptor[] = [];
    public diagnostics: VSCLS.Diagnostic[] = [];
    public constants: ConstantDescriptor[] = [];
    public semanticTokens: SemanticToken[] = [];
    public localVariables: LocalVariableDescriptor[] = [];
}

export class DocumentData {
    public uri: string;
    public reparseTimer: NodeJS.Timeout | null = null;
    public resolvedInclusions: ResolvedInclusion[] = [];
    public callables: CallableDescriptor[] = [];
    public values: ValueDescriptor[] = [];
    public constants: ConstantDescriptor[] = [];
    public dependencies: DM.FileDependency[] = [];
    public semanticTokens: SemanticToken[] = [];
    public localVariables: LocalVariableDescriptor[] = [];

    constructor(uri: string) {
        this.uri = uri;
    }
}