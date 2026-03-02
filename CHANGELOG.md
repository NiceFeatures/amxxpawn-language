---
layout: default
---

<p align="center">
  <a href="/amxxpawn-language/">Página Inicial</a> | 
  <a href="/amxxpawn-language/CHANGELOG.html">Histórico de Mudanças</a>
</p>

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