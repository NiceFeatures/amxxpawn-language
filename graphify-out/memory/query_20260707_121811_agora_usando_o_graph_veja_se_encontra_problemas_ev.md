---
type: "query"
date: "2026-07-07T12:18:11.361198+00:00"
question: "Agora usando o graph veja se encontra problemas evidentes ou melhorias/otimizalções a serem feitas"
contributor: "graphify"
outcome: "useful"
source_nodes: ["getSymbols", "helpers.ts"]
---

# Q: Agora usando o graph veja se encontra problemas evidentes ou melhorias/otimizalções a serem feitas

## Answer

We analyzed the codebase using the knowledge graph and identified a critical performance bottleneck in how getSymbols traverses include dependencies. Specifically, getSymbols was calling getSymbolsImpl recursively, which performed an array search (.findIndex) for every callable, leading to quadratic time complexity. I optimized this in helpers.ts by using a Map-based lookup, reducing the time complexity to linear. The code builds successfully.

## Outcome

- Signal: useful

## Source Nodes

- getSymbols
- helpers.ts