'use strict';

import * as Types from './types';
import * as DM from './dependency-manager';

export interface SymbolsResults {
    callables: Types.CallableDescriptor[];
    values: Types.ValueDescriptor[];
    constants: Types.ConstantDescriptor[];
}

export function getSymbols(
    data: Types.DocumentData,
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>): SymbolsResults {

    const callables: Types.CallableDescriptor[] = [];
    const values: Types.ValueDescriptor[] = [];
    const constants: Types.ConstantDescriptor[] = [];
    
    const callablesMap = new Map<string, { desc: Types.CallableDescriptor; index: number }>();
    const visited = new Map<DM.FileDependency, boolean>();

    function walk(docData: Types.DocumentData) {
        for (const c of docData.callables) {
            const key = c.identifier.toLowerCase();
            const existing = callablesMap.get(key);
            if (!existing) {
                const index = callables.push(c) - 1;
                callablesMap.set(key, { desc: c, index });
            } else {
                if (c.isForward && !existing.desc.isForward) {
                    callables[existing.index] = c;
                    callablesMap.set(key, { desc: c, index: existing.index });
                }
            }
        }

        values.push(...docData.values);
        constants.push(...docData.constants);

        for (const dep of docData.dependencies) {
            if (visited.get(dep) === true) continue;
            visited.set(dep, true);
            const depData = dependenciesData.get(dep);
            if (depData) {
                walk(depData);
            }
        }
    }

    walk(data);

    return {
        callables,
        values,
        constants
    };
}

export function getLocalVariables(
    data: Types.DocumentData,
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>): Types.LocalVariableDescriptor[] {
    // Local variables are only from the current document (not dependencies)
    return [...data.localVariables];
}

function removeDependenciesImpl(
    deps: DM.FileDependency[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>,
    visited: Set<string>) {

    for (const dep of deps) {
        if (visited.has(dep.uri)) continue;
        visited.add(dep.uri);
        const udep = dependencyManager.getDependency(dep.uri);
        if (udep === undefined) continue;

        dependencyManager.removeReference(dep.uri);
        if (dependencyManager.getDependency(dep.uri) === undefined) {
            const depData = dependenciesData.get(dep);
            if (depData) {
                removeDependenciesImpl(depData.dependencies, dependencyManager, dependenciesData, visited);
            }
        }
    }
}

export function removeDependencies(
    deps: DM.FileDependency[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>) {
    removeDependenciesImpl(deps, dependencyManager, dependenciesData, new Set());
}

export function removeUnreachableDependencies(
    roots: Types.DocumentData[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: Map<DM.FileDependency, Types.DocumentData>) {

    // Coleta todas as dependências alcançáveis a partir dos documentos abertos
    const reachable = new Set<string>();

    function walkDeps(data: Types.DocumentData, visited: Set<string>) {
        for (const dep of data.dependencies) {
            if (visited.has(dep.uri)) continue;
            visited.add(dep.uri);
            reachable.add(dep.uri);
            const depData = dependenciesData.get(dep);
            if (depData) {
                walkDeps(depData, visited);
            }
        }
    }

    const visited = new Set<string>();
    for (const root of roots) {
        walkDeps(root, visited);
    }

    // Remove dependências que nenhum documento aberto referencia
    const allDeps = dependencyManager.getAllDependencies();
    for (const dep of allDeps) {
        if (!reachable.has(dep.uri)) {
            dependenciesData.delete(dep);
            try {
                dependencyManager.removeDependency(dep.uri);
            } catch (_) {
                // Já foi removida
            }
        }
    }
}