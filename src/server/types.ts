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
    documentaton: string;
    isForward: boolean;
}

export interface ValueDescriptor {
    label: string;
    identifier: string;
    isConst: boolean;
    file: URI;
    range: VSCLS.Range;
    documentaton: string;
}

export interface ConstantDescriptor {
    label: string;
    identifier: string;
    value: string;
    file: URI;
    range: VSCLS.Range;
}

export class ParserResults {
    public headerInclusions: InclusionDescriptor[] = [];
    public callables: CallableDescriptor[] = [];
    public values: ValueDescriptor[] = [];
    public diagnostics: VSCLS.Diagnostic[] = [];
    public constants: ConstantDescriptor[] = [];
}

export class DocumentData {
    public uri: string;
    public reparseTimer: NodeJS.Timeout | null = null;
    public resolvedInclusions: ResolvedInclusion[] = [];
    public callables: CallableDescriptor[] = [];
    public values: ValueDescriptor[] = [];
    public constants: ConstantDescriptor[] = [];
    public dependencies: DM.FileDependency[] = [];

    constructor(uri: string) {
        this.uri = uri;
    }
}