---
layout: default
---

<p align="center">
  <a href="/amxxpawn-language/">Página Inicial</a> | 
  <a href="/amxxpawn-language/CHANGELOG.html">Histórico de Mudanças</a>
</p>

## [Version 1.5.5] - 2026-07-22
### Fixed
- **Prevenção de Crash em `compileLocal`**: Tratado erro na leitura de diretórios em `compileLocal` para evitar Unhandled Exceptions no Extension Host.
- * **`compileLocal` Crash Prevention**: Fixed unhandled exception when reading directory during local compilation, preventing Extension Host crashes.*
- **Tratamento de Exceção Assíncrona no LSP**: Adicionada captura de rejeição de Promise no temporizador de debounce de reparse do servidor.
- * **Async Exception Handling in LSP**: Added proper promise rejection catch block to reparse debounce timers in Language Server.*

### Security
- **Invocação Segura do Compilador e Extração**: Substituído `CP.exec` por chamadas parametrizadas `CP.execFile` e desativada a opção `shell: true` na execução do `amxxpc`, eliminando riscos de injeção de parâmetros e problemas de escape em caminhos de arquivos.
- * **Secure Process Execution & Extraction**: Replaced `CP.exec` shell concatenation with safe `CP.execFile` calls and disabled `shell: true` on `amxxpc` execution, eliminating parameter injection risks and path escaping bugs.*

### Performance & Refactoring
- **Gestão de Memória no Cache de Includes**: Implementado limite de tamanho (LRU com capacidade para 200 arquivos) no cache de conteúdo de arquivos `.inc` no Language Server para conter o uso de RAM.
- * **Include Cache Memory Management**: Implemented a bounded cache size (LRU up to 200 files) for `.inc` files in the Language Server to prevent excessive RAM usage.*
- **Hoisting de Expressões Regulares**: Otimizadas as funções utilitárias de verificação de caracteres (`isAlpha`, `isAlphaNum`, etc.) reutilizando expressões regulares estáticas para reduzir pressão de Garbage Collection.
- * **RegExp Hoisting**: Optimized character checking utility functions by hoisting static regular expressions, reducing Garbage Collection pressure.*

## [Version 1.5.4] - 2026-07-20
### Fixed
- **Intellisense em Variáveis de Loop**: Corrigida a detecção e realce semântico de variáveis declaradas dentro de loops (como `for (new i = 0; ...)`), garantindo auto-complete e "Go to Definition" corretos no corpo das funções.
- * **Loop Variable Intellisense**: Fixed detection and semantic highlighting for variables declared inside loops (such as `for (new i = 0; ...)`), ensuring correct autocomplete and "Go to Definition" within function bodies.*

## [Version 1.5.3] - 2026-06-22
### Fixed
- **Nested Signature Help inside Macros**: Corrigido o bug onde o Signature Help exibia a definição de macros `#define` com parâmetros (ex: `charsmax()`) ao invés de manter o foco na função externa que envelopa a expressão. Agora, o tooltip mantém a assinatura da função ativa.
- * **Nested Signature Help inside Macros**: Fixed a bug where Signature Help would be hijacked by parameterized `#define` macro calls (like `charsmax()`), preventing the outer function signature from remaining visible.*

## [Version 1.5.1] - 2026-05-24
### Fixed
- **Includes Inside Preprocessor Blocks**: Corrigido um bug onde diretivas `#include` indentadas dentro de blocos condicionais não eram reconhecidas, causando perda de auto-complete e highlights nas sub-includes.
- * **Includes Inside Preprocessor Blocks**: Fixed a bug where indented `#include` directives inside conditional blocks were not recognized, causing sub-includes to lose auto-complete and highlighting.*
- **Find All References Duplicate Results**: Corrigido o bug onde `Shift+F12` exibia definições em duplicidade e operava como "Go to Definition". Agora exibe apenas as referências de forma deduplicada e consistente.
- * **Find All References Duplicate Results**: Fixed a bug where `Shift+F12` displayed definitions multiple times and behaved like "Go to Definition". It now only displays occurrences deduplicated consistently.*
- **Find All References com Símbolos Especiais (@)**: O `Shift+F12` agora reconhece corretamente funções que iniciam com o caractere arroba (ex: `@PlacarHostName`).
- * **Find All References with Special Symbols (@)**: Fixed a bug where "Find All References" would fail to find occurrences for functions starting with the at sign (@).*
- **Find All References dentro de Strings (Callbacks)**: Corrigido um bug na busca de referências onde chamadas de funções e callbacks escritas em forma de string (ex: `set_task(4.0, "@ClearResults")`) eram ignoradas e não listadas no "Find All References". O VS Code agora também busca identificadores isolados dentro das strings, como é tradicional no desenvolvimento Pawn.
- * **Find All References inside Strings (Callbacks)**: Fixed a bug in reference search where function calls and callbacks written as strings (e.g., `set_task(4.0, "@ClearResults")`) were ignored and not listed in "Find All References". VS Code now searches for isolated identifiers inside strings as well, as is traditional in Pawn development.*

## [Version 1.5.0] - 2026-05-08
### Added
- **Linux Support**: Adicionado suporte para sistemas Linux.
- * **Linux Support**: Added support for Linux systems.*
- **Official Compiler Download URL**: Alterada a URL de download automático do compilador para a URL oficial de releases do AmxModX no GitHub.
- * **Official Compiler Download URL**: Switch to official AmxModX github release URL for auto compiler download.*

## [Version 1.4.0] - 2026-04-27
### Added
- **Local Variable Hover & Definition**: Agora o "Go to Definition" (Ctrl+Click) e o Hover funcionam para variáveis locais e parâmetros dentro do corpo das funções.
- * **Local Variable Hover & Definition**: Support for "Go to Definition" (Ctrl+Click) and Hover tooltips for local variables and parameters inside function bodies.*

### Fixed
- **Block Comment Parsing**: Corrigido um bug crítico onde chaves `{}` dentro de comentários em bloco `/* */` quebravam o rastreamento de escopo do parser, impedindo a detecção de variáveis locais em funções subsequentes.
- * **Block Comment Parsing**: Fixed a critical bug where braces `{}` inside block comments `/* */` would break the parser's scope tracking, causing functions below them to lose local variable detection.*
- **Robust Comment Stripping**: O parser agora remove corretamente comentários em bloco de linha única (ex: `/* comment */ new x;`) e lida melhor com caracteres escapados em strings ao contar chaves.
- * **Robust Comment Stripping**: The parser now correctly strips single-line block comments (e.g., `/* comment */ new x;`) and handles escaped characters in strings better when counting braces.*
- **Go to Definition URI Parity**: Corrigido um bug onde o "Go to Definition" poderia falhar ou retornar nulo se símbolos em arquivos diferentes estivessem na mesma linha.
- * **Go to Definition URI Parity**: Fixed a bug where "Go to Definition" could fail or return null if symbols in different files shared the same line number.*
- **Highlighting Priority (new const)**: Resolvido o conflito onde variáveis `new const` eram incorretamente classificadas como membros de enum no realce semântico.
- * **Highlighting Priority (new const)**: Resolved a conflict where `new const` variables were incorrectly classified as enum members in semantic highlighting.*

## [Version 1.3.2] - 2026-04-27

### Fixed
- **Single-character Identifiers**: O parser agora identifica corretamente funções e variáveis com apenas uma letra (ex: `new n;`, `public p(){}`).
- * **Single-character Identifiers**: Fixed the parser to correctly identify functions and variables with only one letter (e.g., `new n;`, `public p(){}`).*
- **Compound Variable Modifiers**: Corrigido o erro onde variáveis com múltiplos modificadores (ex: `new const TEST_ARR`) não eram corretamente reconhecidas devido ao stripping parcial de palavras-chave.
- * **Compound Variable Modifiers**: Fixed an error where variables with multiple modifiers (e.g., `new const TEST_ARR`) were not correctly recognized due to partial keyword stripping.*

## [Version 1.3.1] - 2026-04-25
### Fixed
- **Multi-line Variable Parsing**: Corrigido o parser para identificar corretamente variáveis declaradas em múltiplas linhas (ex: `new a, \n b, \n c;`) ou quando os modificadores estão em uma linha e os identificadores em outra (ex: `public stock const \n PluginName[]`).
- * **Multi-line Variable Parsing**: Fixed the parser to correctly identify variables declared across multiple lines (e.g., `new a, \n b, \n c;`) or when modifiers are on one line and identifiers on another (e.g., `public stock const \n PluginName[]`).*
- **String-aware Parsing (URL Fix)**: O parser agora ignora `//` dentro de aspas, evitando que URLs (como `https://...`) quebrem o reconhecimento da declaração ou causem realces semânticos incorretos (ex: destacar `https` como um tipo).
- * **String-aware Parsing (URL Fix)**: The parser now ignores `//` inside strings, preventing URLs (like `https://...`) from breaking declaration recognition or causing incorrect semantic highlighting (e.g., highlighting `https` as a type).*
- **Semicolon Support**: Melhorado o reconhecimento de variáveis que terminam com `;` em declarações multi-linha.
- * **Semicolon Support**: Improved recognition of variables ending with `;` in multi-line declarations.*

## [Version 1.3.0] - 2026-04-25
### Added
- **Dynamic Include Autocomplete**: O autocomplete de `#include` agora escaneia os diretórios reais configurados no `amxxpawn.compiler.includePaths`, oferecendo sugestões precisas de arquivos `.inc`.
- * **Dynamic Include Autocomplete**: `#include` autocomplete now scans the actual directories configured in `amxxpawn.compiler.includePaths`, providing accurate `.inc` file suggestions.*
- **Semantic Usage Highlighting**: Variáveis, argumentos de funções, macros e constantes agora recebem realce semântico em todo o corpo do código, não apenas na declaração.
- * **Semantic Usage Highlighting**: Variables, function arguments, macros, and constants now receive semantic highlighting throughout the code body, not just at declaration.*
- **Tag Type Highlighting**: Implementado realce de cor para tags de tipo (ex: `Float:`, `bool:`, `Trie:`, `Array:`) em variáveis globais, locais e membros de enum.
- * **Tag Type Highlighting**: Implemented color highlighting for type tags (e.g., `Float:`, `bool:`, `Trie:`, `Array:`) in global and local variables, and enum members.*

### Fixed
- **Real-time Semantic Refresh**: A extensão agora solicita ao VS Code que atualize as cores imediatamente após terminar a análise do código (após o delay de 300ms), eliminando a necessidade de fechar/abrir o arquivo para ver as cores atualizadas.
- * **Real-time Semantic Refresh**: The extension now requests VS Code to refresh colors immediately after code analysis finishes (after the 300ms delay), eliminating the need to close/reopen the file to see updated colors.*
- **Global Tag Highlighting**: Qualquer identificador seguido de dois pontos (ex: `bool:`, `Float:`) agora é corretamente identificado como um tipo em qualquer lugar do código, mesmo sem a palavra-chave `new`.
- * **Global Tag Highlighting**: Any identifier followed by a colon (e.g., `bool:`, `Float:`) is now correctly identified as a type anywhere in the code, even without the `new` keyword.*
- **Macro Coloring**: Macros `#define` sem parâmetros agora são corretamente identificadas como `macro` em vez de `variable`, permitindo cores distintas em temas como o Dark Modern.
- * **Macro Coloring**: `#define` macros without parameters are now correctly identified as `macro` instead of `variable`, allowing distinct colors in themes like Dark Modern.*

---

## [Version 1.2.9] - 2026-04-24
### Added
- **Local Variable Autocomplete**: Variáveis locais e parâmetros agora aparecem no autocomplete quando o cursor está dentro do escopo da função.
- *Local variables and parameters now appear in autocomplete when the cursor is within the function scope.*
- **Preprocessor Directive Autocomplete**: Adicionado suporte para completar diretivas ao digitar `#` (ex: `#include`, `#define`, `#pragma`).
- *Added support for completing directives when typing `#` (e.g., `#include`, `#define`, `#pragma`).*
### Fixed
- **Function Parameter Coloring**: Parâmetros de funções agora são corretamente coloridos no editor via Semantic Tokens.
- *Function parameters are now correctly colored in the editor via Semantic Tokens.*
- **Local Variable Coloring**: Variáveis declaradas dentro de funções agora recebem realce semântico de forma robusta.
- *Variables declared inside functions now receive robust semantic highlighting.*

---

## [Version 1.2.8] - 2026-04-05
### Fixed
- **Parser Multi-line Arguments**: Corrigido um bug onde funções com argumentos declarados em múltiplas linhas não eram corretamente identificadas pelo parser, afetando "Go to Definition" e syntax highlighting semântico.
- * **Parser Multi-line Arguments**: Fixed a bug where functions with arguments declared across multiple lines were not correctly identified by the parser, affecting "Go to Definition" and semantic syntax highlighting.*
- **TypeScript moduleResolution**: Alterado `moduleResolution` de `"node"` para `"bundler"` no `tsconfig.json`, resolvendo aviso de depreciação (a opção `node10` será removida no TypeScript 7.0).
- * **TypeScript moduleResolution**: Changed `moduleResolution` from `"node"` to `"bundler"` in `tsconfig.json`, resolving deprecation warning (`node10` will be removed in TypeScript 7.0).*

---

## [Version 1.2.7] - 2026-04-03
### Added
- **Configuração de Erros Inline**: Adicionada a opção `amxxpawn.compiler.inlineErrors` (falso por padrão) para ativar os erros na linha caso você não utilize algo como a extensão Error Lens.
- * **Inline Errors Configuration**: Added the `amxxpawn.compiler.inlineErrors` setting (false by default) to enable inline error display, for users who do not use extensions like Error Lens.*

---

## [Version 1.2.6] - 2026-04-02
### Added
- **AMXXPawn: Create New Plugin (Scaffold)**: Adicionado um gerador de plugins, acessível pela Command Palette.
- * **AMXXPawn: Create New Plugin (Scaffold)**: Added a plugin generator, accessible via Command Palette.*
- **Templates Nativos**: O Scaffold oferece templates (Basic, Menu, Cvar/Command, Event Observer) com inclusão opcional do `#include <reapi>`.
- * **Native Templates**: The Scaffold offers templates (Basic, Menu, Cvar/Command, Event Observer) with optional `#include <reapi>`.*
- **Workflow Automático**: O scaffold fará o download da compilação se a pasta do compilador não for encontrada e gera o arquivo sem salvar para testes imediatos.
- * **Automatic Workflow**: The scaffold will download the compiler if the folder is not found and generates an unsaved file for immediate usage.*

---

## [Version 1.2.5] - 2026-04-02
### Added
- **Auto-Download do Compilador**: Quando nenhum compilador está configurado, a extensão baixa automaticamente o `compiler.zip` do repositório GitHub, extrai e usa — zero configuração necessária.
- * **Auto-Download Compiler**: When no compiler is configured, the extension automatically downloads `compiler.zip` from the GitHub repository, extracts and uses it — zero configuration required.*
- **Find All References**: `Shift+F12` em qualquer símbolo (variável, função, constante) exibe todas as ocorrências no documento atual e nos includes carregados.
- * **Find All References**: `Shift+F12` on any symbol (variable, function, constant) shows all occurrences in the current document and loaded includes.*
- **Rename Symbol**: `F2` em qualquer símbolo renomeia todas as ocorrências no documento atual. Keywords reservadas do Pawn são protegidas contra renomeação acidental.
- * **Rename Symbol**: `F2` on any symbol renames all occurrences in the current document. Reserved Pawn keywords are protected against accidental renaming.*
- **Inline Error Display**: Erros de compilação agora são exibidos diretamente na linha do código como texto inline (ao lado do código), além do sublinhado vermelho tradicional nos diagnósticos.
- * **Inline Error Display**: Compilation errors are now displayed directly on the code line as inline text (next to the code), in addition to the traditional red underline in diagnostics.*
- **Botão de Compilação no Editor**: Adicionado o ícone `▶️` nativo do VS Code na barra de título do editor para compilar o plugin com um clique.
- * **Editor Compile Button**: Added the native VS Code `▶️` icon in the editor title bar to compile the plugin with a single click.*

---

## [Version 1.2.4] - 2026-04-01
### Added
- **Identidade Visual**: Atualização do Logo e de todos os metadados da extensão para fortalecer o projeto e diferenciar de outras versões na loja.
- * **Visual Identity**: Logo and metadata update to strengthen the project and differentiate from other versions in the store.*
- **Performance**: Integração profunda com o moderno empacotador `esbuild`. A extensão foi comprimida de centenas de arquivos para um formato denso de ~14 arquivos, resultando em um **carregamento/ativação quase instantânea** no VS Code. O delay de leitura do HD caiu drasticamente.
- * **Performance**: Deep integration with the modern `esbuild` bundler. The extension was compressed from hundreds of files to a dense format of ~14 files, resulting in **near-instant loading/activation** in VS Code. HDD read delay dropped drastically.*

---

## [Version 1.2.2] - 2026-03-03
### Fixed
- Corrigido o realce semântico de `#include`: a diretiva e o nome do arquivo agora recebem cores distintas.
- *Fixed semantic highlighting for `#include`: the directive and filename now get distinct colors.*
- Corrigido bug onde enums com `{` na mesma linha (ex: `enum _: Name {`) causavam a perda de realce em todo o código abaixo.
- *Fixed a bug where enums with `{` on the same line caused all code below to lose highlighting.*
- Corrigido o reconhecimento de membros de enum com tags (ex: `bool:Member`, `Float:Value`). A tag e o membro agora são identificados separadamente.
- *Fixed recognition of tagged enum members (e.g., `bool:Member`, `Float:Value`). The tag and member are now identified separately.*
- Corrigido o reconhecimento de múltiplas variáveis declaradas na mesma linha (ex: `new Cvar, Cvar2`). Todas as variáveis agora recebem realce.
- *Fixed recognition of multiple variables declared on the same line (e.g., `new Cvar, Cvar2`). All variables now receive highlighting.*

---

## [Version 1.2.1] - 2026-03-02
### Added
- Adicionado suporte a **Inglês** e **Português (PT-BR)**. A extensão agora exibe todas as mensagens, descrições de configuração e saída do compilador no idioma do VS Code do usuário.
- *Added **English** and **Portuguese (PT-BR)** support. The extension now displays all messages, configuration descriptions, and compiler output in the user's VS Code language.*
- Adicionado **Semantic Tokens Provider**: funções, macros (`#define`), variáveis, constantes e valores de `enum` agora são destacados com cores diferentes no editor, de acordo com o tema de cores utilizado.
- *Added **Semantic Tokens Provider**: functions, macros (`#define`), variables, constants, and `enum` values are now highlighted with different colors in the editor, based on the active color theme.*

---

## [Version 1.2.0] - 2026-03-02
### Added
- Adicionado suporte a `enum`: valores de enums agora aparecem no Autocomplete e no `Ctrl+Click` (Ir para Definição).
- *Added `enum` support: enum values now appear in Autocomplete and `Ctrl+Click` (Go to Definition).*
- Adicionados 36 snippets prontos para uso, como `plugin`, `forplayers`, `menu_create`, `sql_threadquery`, entre outros. Basta digitar o prefixo e pressionar `Tab`.
- *Added 36 ready-to-use snippets such as `plugin`, `forplayers`, `menu_create`, `sql_threadquery`, and more. Just type the prefix and press `Tab`.*
### Fixed
- Corrigida a extensão monitorando todos os arquivos do workspace desnecessariamente, o que causava lentidão em projetos grandes. Agora monitora apenas arquivos `.sma` e `.inc`.
- *Fixed the extension unnecessarily watching all files in the workspace, which caused slowdowns in large projects. Now only `.sma` and `.inc` files are monitored.*
- Corrigido o re-parse que acontecia a cada tecla digitada. Agora aguarda 300ms após parar de digitar, resultando em uma experiência muito mais fluida.
- *Fixed re-parsing happening on every keystroke. Now waits 300ms after you stop typing, resulting in a much smoother experience.*
- Corrigido um bug onde o parser perdia o rastreamento de funções quando uma string continha `{` ou `}` (ex: `formatex(msg, charsmax(msg), "{gold}Olá")`).
- *Fixed a bug where the parser lost track of functions when a string contained `{` or `}` (e.g., `formatex(msg, charsmax(msg), "{gold}Hello")`).*
- Corrigido um problema de memória onde arquivos `.inc` que não eram mais usados continuavam carregados na memória.
- *Fixed a memory issue where `.inc` files that were no longer used remained loaded in memory.*
- Adicionado cache de arquivos `.inc`: agora os includes são lidos do disco apenas uma vez. Quando um `.inc` é salvo, o cache é atualizado automaticamente.
- *Added `.inc` file caching: includes are now read from disk only once. When an `.inc` is saved, the cache is automatically updated.*
- Atualizado o uso de APIs depreciadas do VS Code (`workspace.rootPath` → `workspaceFolders`).
- *Updated usage of deprecated VS Code APIs (`workspace.rootPath` → `workspaceFolders`).*
- Removido código morto e dependências internas não utilizadas, reduzindo o tamanho da extensão.
- *Removed dead code and unused internal dependencies, reducing the extension size.*

## [Version 1.1.9] - 2025-08-01
### Fixed
- Corrigido o Autocomplete que exibia sugestões irrelevantes (busca "fuzzy") ao digitar parâmetros de funções. A lógica foi alterada para uma busca exata ("começa com"), resultando em sugestões mais limpas e precisas.
- *Fixed Autocomplete displaying irrelevant suggestions (fuzzy search) when typing function parameters. The logic was changed to a strict "starts with" search, resulting in cleaner and more accurate suggestions.*

## [Version 1.1.8] - 2025-07-26
### Fixed
- Corrigido um bug crítico onde o `Ctrl+Click` (`Ir para Definição`) não funcionava em funções que utilizavam uma tag (ex: `bool:IsVip(id)`).
- *Fixed a critical bug where `Ctrl+Click` (Go to Definition) did not work on functions using a tag (e.g., `bool:IsVip(id)`).*
### Added
- A funcionalidade de *hover* agora exibe a documentação completa da função (comentários `/** ... */`) em vez de apenas a sua assinatura.
- *Hover feature now displays the full function documentation (`/** ... */` comments) instead of just its signature.*

## [Version 1.1.7] - 2025-07-18
### Fixed
- Corrigido um bug visual onde diretivas `#include` com espaços (ex: `#include < fun >`) eram incorretamente sublinhadas como erro.
- *Fixed a visual bug where `#include` directives with spaces (e.g., `#include < fun >`) were incorrectly underlined as errors.*

## [Version 1.1.6] - 2025-07-07
### Fixed
- Inserido novamente o README.md.
- *Inserted README.md*

## [Version 1.1.5] - 2025-07-04
### Fixed
- Corrigido um bug crítico de realce de sintaxe que afetava strings com URLs (http://), especialmente dentro de operadores ternários.
- *Fixed a critical syntax highlighting bug that affected strings with URLs (http://), especially within ternary operators.*

## [Version 1.1.4] - 2025-07-03
### Added
- Aprimorada a Ajuda de Assinatura (`Signature Help`) para suportar parâmetros nomeados e destacar o parâmetro correto.
- *Enhanced Signature Help to support named parameters and highlight the correct parameter.*
- Desativado o Autocomplete dentro de parênteses `()` para evitar sugestões irrelevantes.
- *Disabled Autocomplete inside parentheses `()` to prevent irrelevant suggestions.*

## [Version 1.1.3] - 2025-06-30
### Added
- Tradução do changelog para inglês
- *Changelog translated to English*

## [Version 1.1.2] - 2025-06-30
### Added
- Melhor ajuste no autocomplete e busca de includes e definições
- *Finer tuning for autocomplete and searching for includes and definitions*

## [Version 1.1.1] - 2025-06-30
### Added
- Melhorias no CTRL + CLICK e ajustes para melhor uso e busca
- *Improvements to CTRL + CLICK and adjustments for better usage and searching*

## [Version 1.1.0] - 2025-06-29
### Added
- Bind automática do compilador no F9 adicionada por padrão
- *Automatic compiler binding to F9 added by default*

## [Version 1.0.9] - 2025-06-29
### Added
- Melhorada a saida do compilador com mensagens mais completas de compilação e de erro
- *Improved compiler output with more complete compilation and error messages*

## [Version 1.0.8] - 2025-06-29
### Added
- Atualizada função CTRL + Click para tbm encontrar a função dentro de set_task e etc
- *Updated CTRL + Click feature to also find functions within set_task, etc.*

## [Version 1.0.7] - 2025-06-29
### Added
- Atualizado link com acesso para o github
- *Updated link with access to GitHub*

## [Version 1.0.6] - 2025-06-29
### Added
- Atualizado dependencias do projeto
- *Updated project dependencies*
- Corrigido CTRL + Click que não funcionava corretamente em funções iniciadas com @
- *Fixed CTRL + Click that was not working correctly on functions starting with @*
- Corrigida função do click nas includes (versão web) não entendia funções do reapi
- *Fixed click function on includes (web version) that did not recognize reapi functions*