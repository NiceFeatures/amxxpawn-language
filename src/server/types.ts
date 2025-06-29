'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as DM from './dependency-manager';
import { URI } from 'vscode-uri'; // Corrigido de 'Uri' para '{ URI }'

export interface InclusionDescriptor {
    // The included filename
    filename: string;

    // This dependency has been included with '#include filename' or '#include "filename"'
    isLocal: boolean;

    // This dependency has been included with '#tryinclude'
    isSilent: boolean;

    // Where in the file is the #include statement
    start: VSCLS.Position;
    end: VSCLS.Position;
};

export interface ResolvedInclusion {
    descriptor: InclusionDescriptor;
    uri: string;
};

export interface CallableDescriptor {
    // Prototype
    label: string;

    // Identifier (without storage specifiers and parameters)
    identifier: string;

    // Where in the file is the callable defined
    file: URI; // Corrigido de 'Uri' para 'URI'
    start: VSCLS.Position;
    end: VSCLS.Position;

    // Parameter informations
    parameters: VSCLS.ParameterInformation[];

    documentaton: string;
};

export interface ValueDescriptor {
    // Prototype
    label: string;
    
    // Identifier (without storage specifiers and parameters)
    identifier: string;

    // Is constant?
    isConst: boolean;

    // Where is it defined
    file: URI; // Corrigido de 'Uri' para 'URI'
    range: VSCLS.Range;

    documentaton: string;
}

export class ParserResults {
    public headerInclusions: InclusionDescriptor[];
    public callables: CallableDescriptor[];
    public values: ValueDescriptor[];
    public diagnostics: VSCLS.Diagnostic[];

    public constructor() {
        this.headerInclusions = [];
        this.callables = [];
        this.values = [];
        this.diagnostics = [];
    }
};

export class DocumentData {
    public uri: string;
    public reparseTimer: NodeJS.Timeout | null; // Corrigido para um tipo mais compatível
    public resolvedInclusions: ResolvedInclusion[];
    public callables: CallableDescriptor[];
    public values: ValueDescriptor[];
    public dependencies: DM.FileDependency[];

    constructor(uri: string) {
        this.uri = uri;
        this.reparseTimer = null; 
        this.resolvedInclusions = [];
        this.callables = [];
        this.values = [];
        this.dependencies = [];
    }
};