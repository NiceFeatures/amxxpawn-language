---
## layout: default

<div align="center">
  <img src="images/extension-logo.png" alt="AMXXPawn Language Extended Logo" width="150" />
</div>

<h1 align="center" style="border-bottom: none; margin-bottom: 0;">AMXXPawn Language - Extended</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=iceeedR.amxx-pawn-language-editor">
    <img alt="Visual Studio Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/iceeedR.amxx-pawn-language-editor?style=for-the-badge&color=2ea043">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=iceeedR.amxx-pawn-language-editor">
    <img alt="Visual Studio Marketplace Installs" src="https://img.shields.io/visual-studio-marketplace/i/iceeedR.amxx-pawn-language-editor?style=for-the-badge&color=blue">
  </a>
  <a href="https://open-vsx.org/extension/iceeedR/amxx-pawn-language-editor">
    <img alt="Open VSX Installs" src="https://img.shields.io/open-vsx/dt/iceeedR/amxx-pawn-language-editor?style=for-the-badge&color=blue">
  </a>
</p>

<div style="background-color: rgba(255, 165, 0, 0.1); border-left: 4px solid #ffa500; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <strong style="color: #ff8c00;">⚠️ DISCLAIMER:</strong> This extension ("AMXXPawn Language - Extended") is a <strong>fork</strong> of the original <a href="https://marketplace.visualstudio.com/items?itemName=KliPPy.amxxpawn-language" style="color: #ff8c00;">AMXXPawn Language</a> extension by KliPPy. It is not affiliated with the original author. This fork includes specific enhancements for local workflows, improved compilation tasks, and targeted syntax additions.
</div>

---

<p align="center">
  <a href="/amxxpawn-language/">Página Inicial</a> | 
  <a href="/amxxpawn-language/CHANGELOG.html">Histórico de Mudanças</a>
</p>

This project revives and modernizes the development experience for **AMX Mod X** scripters. If you love creating plugins for Half-Life, Counter-Strike 1.6, and other GoldSrc mods but miss modern tools, this extension is for you.

It transforms VS Code into a powerful IDE for Pawn, bringing features that were previously exclusive to newer languages.

## ✨ What's New (v1.2.5)
### Added
- **Auto-Download do Compilador**: Quando nenhum compilador está configurado, a extensão baixa automaticamente o `compiler.zip` do repositório GitHub — zero configuração.
- * **Auto-Download Compiler**: When no compiler is configured, the extension automatically downloads `compiler.zip` from the GitHub repository — zero configuration.*
- **Find All References**: `Shift+F12` em qualquer símbolo exibe todas as ocorrências no documento atual e nos includes carregados.
- * **Find All References**: `Shift+F12` on any symbol shows all occurrences in the current document and loaded includes.*
- **Rename Symbol**: `F2` em qualquer símbolo renomeia todas as ocorrências no documento atual. Keywords reservadas do Pawn são protegidas.
- * **Rename Symbol**: `F2` on any symbol renames all occurrences in the current document. Reserved Pawn keywords are protected.*
- **Inline Error Display**: Erros de compilação agora são exibidos diretamente na linha do código como texto inline, além do sublinhado vermelho.
- * **Inline Error Display**: Compilation errors are now displayed directly on the code line as inline text, alongside the traditional red underline.*
- **Botão de Compilação no Editor**: Ícone `▶️` nativo na barra de título do editor para compilar com um clique.
- * **Editor Compile Button**: Native `▶️` icon in the editor title bar to compile with a single click.*

---

## ✨ What's New (v1.2.4)
### Added
- **Identidade Visual**: Atualização do Logo e branding da extensão.
- * **Visual Identity**: Extension logo and branding update.*
- **Performance de Carregamento**: Integrado o poderoso compilador `esbuild` no core da extensão. Reduzimos a quantidade de fragmentos carregados de 276 para apenas 14 arquivos finais otimizados (`dist/`). O tempo de ativação do seu Language Server e inicialização do VSCode agora é quase instantâneo, batendo recordes de velocidade.
- * **Loading Performance**: Integrated the powerful `esbuild` bundler into the extension's core. We reduced the amount of loaded fragments from 276 strictly to 14 optimized final files (`dist/`). Start up and Language Server activation time is now nearly instantaneous, hitting record speeds.*

---

## ✨ What's New (v1.2.2)
### Fixed
- Realce semântico para `#include`: diretiva e nome do arquivo agora têm cores distintas.
- *`#include` highlighting: directive and filename now have distinct colors.*
- Enums com `{` na mesma linha não quebram mais o realce do código abaixo.
- *Enums with `{` on the same line no longer break highlighting of code below.*
- Membros de enum com tags (`bool:Member`, `Float:Value`) agora são reconhecidos corretamente.
- *Tagged enum members (`bool:Member`, `Float:Value`) are now properly recognized.*
- Múltiplas variáveis na mesma linha (`new a, b, c`) agora recebem realce individualmente.
- *Multiple variables on the same line (`new a, b, c`) are now highlighted individually.*

---

## ✨ What's New (v1.2.1)
### Added
- Suporte a **Inglês** e **Português (PT-BR)**. Mensagens, configurações e saída do compilador seguem o idioma do VS Code.
- *Added **English** and **Portuguese (PT-BR)** support. Messages, settings, and compiler output follow the VS Code language.*
- **Semantic Tokens**: funções, macros, variáveis, constantes e enums são destacados com cores distintas no editor.
- *Functions, macros, variables, constants, and enums are now highlighted with distinct colors in the editor.*

---

## ✨ What's New (v1.2.0)
### Added
- Adicionado suporte a `enum`: valores de enums agora aparecem no Autocomplete e no `Ctrl+Click` (Ir para Definição).
- *Added `enum` support: enum values now appear in Autocomplete and `Ctrl+Click` (Go to Definition).*
- Adicionados 36 snippets prontos para uso, como `plugin`, `forplayers`, `menu_create`, `sql_threadquery`, entre outros.
- *Added 36 ready-to-use snippets such as `plugin`, `forplayers`, `menu_create`, `sql_threadquery`, and more.*
### Fixed
- Melhorias significativas de performance: cache de includes, debounce de 300ms no re-parse, e monitoramento apenas de arquivos `.sma` e `.inc`.
- *Significant performance improvements: include caching, 300ms re-parse debounce, and monitoring only `.sma` and `.inc` files.*
- Corrigido bug onde strings contendo `{` ou `}` quebravam o parser (ex: `"{gold}Olá"`).
- *Fixed a bug where strings containing `{` or `}` broke the parser (e.g., `"{gold}Hello"`).*
- Corrigido vazamento de memória com arquivos `.inc` que não eram mais utilizados.
- *Fixed memory leak with `.inc` files that were no longer in use.*

---

## ✨ What's New (v1.1.9)
### Fixed
- Corrigido o Autocomplete que exibia sugestões irrelevantes (busca "fuzzy") ao digitar parâmetros de funções. A lógica foi alterada para uma busca exata ("começa com"), resultando em sugestões mais limpas e precisas.
- *Fixed Autocomplete displaying irrelevant suggestions (fuzzy search) when typing function parameters. The logic was changed to a strict "starts with" search, resulting in cleaner and more accurate suggestions.*

---

## ✨ What's New (v1.1.8)

### Fixed
- Corrigido um bug crítico onde o `Ctrl+Click` (`Ir para Definição`) não funcionava em funções que utilizavam uma tag (ex: `bool:IsVip(id)`).
- *Fixed a critical bug where `Ctrl+Click` (Go to Definition) did not work on functions using a tag (e.g., `bool:IsVip(id)`).*
### Added
- A funcionalidade de *hover* agora exibe a documentação completa da função (comentários `/** ... */`) em vez de apenas a sua assinatura.
- *Hover feature now displays the full function documentation (`/** ... */` comments) instead of just its signature.*

---

## ✨ What's New (v1.1.7)

- **Visual Bug Fix:** The extension will no longer incorrectly underline `#include` directives that contain spaces (e.g., `#include < fun >`).

---

## ✨ Key Features (Extended Version)

Unlike the original extension, this **Extended** version provides tailored optimizations focused on local custom workflows, alongside a complete **Language Server** toolset:

- **🟢 Advanced IntelliSense:** Crisp autocomplete for functions, constants, and variables.
- **🎯 Smart Code Navigation:** Press `Ctrl+Click` to instantly jump to the definition of:
  - Functions (including `public`, `stock`, `native`, and those with an `@` prefix).
  - Constants defined with `#define`.
  - Global variables.
  - **Functions in Tasks:** Navigate directly to the function when its name is passed as a string (e.g., `set_task_ex(..., "my_function", ...)`).
- **🔍 Find All References:** `Shift+F12` on any symbol to find all its occurrences across the current document and loaded includes.
- **✏️ Rename Symbol:** `F2` to rename any variable, function, or constant across the entire document — with keyword protection.
- **💡 Hover Information:** Hover over a function or variable to seamlessly read its full definition and documentation without leaving your current context.
- **⚡ Real-time Diagnostics:** The extension boldly warns you if an `#include` cannot be found or resolving fails, helping you fix errors long before compiling.
- **🔴 Inline Error Display:** Compilation errors appear directly on the code line as inline text, next to the red underline.
- **📥 Auto-Download Compiler:** No compiler configured? The extension automatically downloads and sets up the AMXX compiler from GitHub.
- **🛠️ Integrated & Custom Compilation:** Compile your plugins instantly from VS Code using unified tasks setup or custom local environment pathways.

## 🚀 Installation

1. Install [Visual Studio Code](https://code.visualstudio.com/).
2. Open the **Extensions** tab (`Ctrl+Shift+X`).
3. Search for `AMXXPawn Language Service`.
4. Click **Install**.
5. Reload VS Code and enjoy!

You can also install it directly from the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=iceeedR.amxx-pawn-language-editor).

## ⚙️ Configuration (Essential Step!)

For the extension to work 100%, you **must** tell it where your AMXX compiler and `include` files are located.

1. Open VS Code Settings (`Ctrl + ,`).
2. Click the "Open settings.json" icon in the upper-right corner.
3. Add the following properties to your `settings.json`:

```json
{
    // Path to the amxxpc compiler executable.
    "amxxpawn.compiler.executablePath": "C:\\path\\to\\your\\compiler\\amxxpc.exe",

    // List of folders where the extension should look for .inc files.
    // ESSENTIAL for "Go to Definition" of native functions to work.
    "amxxpawn.compiler.includePaths": [
        "C:\\path\\to\\your\\compiler\\include"
    ],

    // --- RECOMMENDED SETTING ---
    // For a cleaner and smarter autocomplete experience,
    // disable generic suggestions based on words in the file.
    "editor.wordBasedSuggestions": "off"
}
```

**IMPORTANT for Windows users:** In JSON files, you must use double backslashes (`\\`) or forward slashes (`/`) in paths.

**Practical Example:**

```json
{
    "amxxpawn.compiler.executablePath": "C:/AMXX/compiler/amxxpc.exe",
    "amxxpawn.compiler.includePaths": [
        "C:/AMXX/compiler/include"
    ]
}
```

## ⌨️ Available Commands

Open the Command Palette (`Ctrl+Shift+P`) and type `AMXXPawn` to see the available commands:

- **AMXXPawn: Compile Plugin** — Compiles the currently open `.sma` file using the `executablePath` defined in your settings.
- **AMXXPawn: Compile Plugin Local** — Searches for and uses an `amxxpc.exe` located in the same folder as the `.sma` file you are editing.

## 🛠️ For Developers and Contributors

This project is a modernization of a legacy codebase, now using TypeScript and the latest `vscode-languageclient` APIs. Contributions are very welcome!

**To compile and test locally:**

1. Clone the repository:  
   `git clone https://github.com/NiceFeatures/amxxpawn-language.git`
2. Install dependencies:  
   `npm install`
3. Compile the project (bundle with esbuild):  
   `npm run esbuild`
4. Open the project in VS Code and press `F5` to start a debugging session.

## 🙏 Acknowledgements

This project is a continuation and modernization of the incredible work originally done by **KliPPy**. All credit for the solid foundation and the original idea goes to him.

## 📄 License

This project is licensed under the **GPL-3.0**. See the `LICENSE` file for more details.
