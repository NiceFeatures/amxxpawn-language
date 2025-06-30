'use strict';

import * as Types from './types';
import * as DM from './dependency-manager';

export interface SymbolsResults {
    callables: Types.CallableDescriptor[];
    values: Types.ValueDescriptor[];
    constants: Types.ConstantDescriptor[];
}

function getSymbolsImpl(
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>,
    visited: Map<DM.FileDependency, boolean>): SymbolsResults {

    // Começa com os símbolos do documento atual
    const symbols: SymbolsResults = {
        callables: [...data.callables],
        values: [...data.values],
        constants: [...data.constants]
    };

    // Busca recursivamente os símbolos das dependências (.inc)
    for (const dep of data.dependencies) {
        if (visited.get(dep) === true) continue;
        visited.set(dep, true);
        const depData = dependenciesData.get(dep);
        if (!depData) continue;

        const results = getSymbolsImpl(depData, dependenciesData, visited);
        
        // --- INÍCIO DA LÓGICA CORRIGIDA ---
        // Para cada função ('callable') vinda de uma dependência...
        results.callables.forEach(newCallable => {
            const existingIndex = symbols.callables.findIndex(c => c.identifier === newCallable.identifier);

            if (existingIndex === -1) {
                // Se a função não existe na nossa lista, apenas a adicionamos.
                symbols.callables.push(newCallable);
            } else {
                // Se já existe uma função com o mesmo nome, aplicamos a regra de prioridade.
                const existingCallable = symbols.callables[existingIndex];
                
                // A 'forward' (newCallable) tem prioridade sobre a 'public' (existingCallable).
                // Se a nova função é uma 'forward' e a que já temos não é, então substituímos.
                if (newCallable.isForward && !existingCallable.isForward) {
                    symbols.callables[existingIndex] = newCallable;
                }
                // Caso contrário (se a existente já é a 'forward'), não fazemos nada, mantendo a prioridade.
            }
        });
        // --- FIM DA LÓGICA CORRIGIDA ---

        // A lógica para values e constants pode permanecer a mesma por enquanto.
        symbols.values.push(...results.values);
        symbols.constants.push(...results.constants);
    }
    return symbols;
}

export function getSymbols(
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): SymbolsResults {
    return getSymbolsImpl(data, dependenciesData, new Map());
}

function removeDependenciesImpl(
    deps: DM.FileDependency[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>,
    visited: Map<DM.FileDependency, boolean>) {

    for(const dep of deps) {
        if(visited.get(dep) === true) continue;
        visited.set(dep, true);
        const udep = dependencyManager.getDependency(dep.uri);
        if(udep === undefined) continue;

        dependencyManager.removeReference(dep.uri);
        if(dependencyManager.getDependency(dep.uri) === undefined) {
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
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>) {
    removeDependenciesImpl(deps, dependencyManager, dependenciesData, new Map());
}

export function removeUnreachableDependencies(
    roots: Types.DocumentData[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>) {
    // Manter vazio por enquanto para garantir estabilidade.
}