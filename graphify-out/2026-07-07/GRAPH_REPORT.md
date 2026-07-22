# Graph Report - .  (2026-07-07)

## Corpus Check
- 2 files · ~42,426 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 242 nodes · 280 edges · 14 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Compiler Settings|Compiler Settings]]
- [[_COMMUNITY_Extension Metadata|Extension Metadata]]
- [[_COMMUNITY_Language Server Parser|Language Server Parser]]
- [[_COMMUNITY_Client and Commands|Client and Commands]]
- [[_COMMUNITY_Dependency Management|Dependency Management]]
- [[_COMMUNITY_Server Lifecycle|Server Lifecycle]]
- [[_COMMUNITY_Extension Contributions|Extension Contributions]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Documentation and Workflows|Documentation and Workflows]]
- [[_COMMUNITY_Server Types|Server Types]]
- [[_COMMUNITY_Build and Dev Dependencies|Build and Dev Dependencies]]
- [[_COMMUNITY_String Helpers|String Helpers]]
- [[_COMMUNITY_Syntax Grammar|Syntax Grammar]]
- [[_COMMUNITY_Compiler Output Config|Compiler Output Config]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 12 edges
2. `AMXXPawn Language - Extended` - 11 edges
3. `contributes` - 9 edges
4. `ensureCompiler()` - 7 edges
5. `FileDependencyManager` - 7 edges
6. `positionToIndex()` - 7 edges
7. `findIdentifierAtCursor()` - 6 edges
8. `configuration` - 5 edges
9. `amxxpawn.compiler.outputType` - 5 edges
10. `scripts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `AMXXPawn Language - Extended` --references--> `Extension Logo`  [EXTRACTED]
  README.md → images/extension-logo.png
- `GitHub Release Workflows` --conceptually_related_to--> `AMXXPawn Language - Extended`  [INFERRED]
  .github/workflows/release.yml → README.md
- `AMXXPawn Language - Extended` --conceptually_related_to--> `Changelog History`  [INFERRED]
  README.md → index.md
- `GitHub CI Workflows` --conceptually_related_to--> `AMXXPawn Language - Extended`  [INFERRED]
  .github/workflows/main.yml → README.md
- `Query: Se encontra problemas evidentes ou melhorias/otimizações` --references--> `getSymbols()`  [EXTRACTED]
  graphify-out/memory/query_20260707_121811_agora_usando_o_graph_veja_se_encontra_problemas_ev.md → src/server/helpers.ts

## Import Cycles
- None detected.

## Communities (14 total, 0 thin omitted)

### Community 0 - "Compiler Settings"
Cohesion: 0.05
Nodes (41): default, description, type, default, description, type, default, description (+33 more)

### Community 1 - "Extension Metadata"
Cohesion: 0.06
Nodes (35): activationEvents, author, name, url, bugs, url, categories, dependencies (+27 more)

### Community 2 - "Language Server Parser"
Cohesion: 0.11
Nodes (20): doDefinition(), doHover(), doPrepareRename(), doReferences(), doRename(), doSignatures(), extractParamName(), findFunctionIdentifier() (+12 more)

### Community 3 - "Client and Commands"
Cohesion: 0.14
Nodes (17): activate(), onDidChangeTextDocument(), compile(), compileLocal(), createPlugin(), doCompile(), downloadFile(), ensureCompiler() (+9 more)

### Community 4 - "Dependency Management"
Cohesion: 0.16
Nodes (15): resolvePathVariables(), substituteVariables(), connection, dependenciesData, dependencyManager, documentsData, documentsManager, doReparse() (+7 more)

### Community 5 - "Server Lifecycle"
Cohesion: 0.13
Nodes (15): editor.semanticHighlighting.enabled, id, title, type, [amxxpawn], contributes, commands, configuration (+7 more)

### Community 6 - "Extension Contributions"
Cohesion: 0.14
Nodes (13): compilerOptions, lib, module, moduleResolution, noImplicitAny, outDir, rootDir, skipLibCheck (+5 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.15
Nodes (13): Version 1.5.3 Release, GitHub Release Workflows, Changelog History, Extension Logo, Compiler Auto-Download, Integrated Compilation, AMXXPawn Language - Extended, Fork of KliPPy extension (+5 more)

### Community 8 - "Documentation and Workflows"
Cohesion: 0.15
Nodes (11): CallableDescriptor, ConstantDescriptor, DocumentData, InclusionDescriptor, LocalVariableDescriptor, ParserResults, ResolvedInclusion, SemanticToken (+3 more)

### Community 9 - "Server Types"
Cohesion: 0.18
Nodes (11): esbuild, esbuildProblemMatcherPlugin, main(), production, watch, devDependencies, esbuild, @types/node (+3 more)

### Community 10 - "Build and Dev Dependencies"
Cohesion: 0.18
Nodes (3): DependencyDescriptor, FileDependency, FileDependencyManager

### Community 11 - "String Helpers"
Cohesion: 0.32
Nodes (5): Query: Se encontra problemas evidentes ou melhorias/otimizações, getSymbols(), removeDependencies(), removeDependenciesImpl(), SymbolsResults

### Community 12 - "Syntax Grammar"
Cohesion: 0.33
Nodes (5): name, patterns, $schema, scopeName, uuid

### Community 13 - "Compiler Output Config"
Cohesion: 0.40
Nodes (5): default, description, enum, type, amxxpawn.compiler.outputType

## Knowledge Gaps
- **136 isolated node(s):** `esbuild`, `production`, `esbuildProblemMatcherPlugin`, `name`, `displayName` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `properties` connect `Compiler Settings` to `Server Lifecycle`, `Compiler Output Config`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `contributes` connect `Server Lifecycle` to `Extension Metadata`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `configuration` connect `Server Lifecycle` to `Compiler Settings`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AMXXPawn Language - Extended` (e.g. with `GitHub Release Workflows` and `Changelog History`) actually correct?**
  _`AMXXPawn Language - Extended` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `esbuild`, `production`, `esbuildProblemMatcherPlugin` to the rest of the system?**
  _137 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Compiler Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `Extension Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._