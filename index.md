---
## layout: default

# AMXXPawn Language Service for Visual Studio Code

---

This project revives and modernizes the development experience for **AMX Mod X** scripters. If you love creating plugins for Half-Life, Counter-Strike 1.6, and other GoldSrc mods but miss modern tools, this extension is for you.

It transforms VS Code into a powerful IDE for Pawn, bringing features that were previously exclusive to newer languages.

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

## ✨ Key Features

This extension goes far beyond simple syntax highlighting. It offers a complete **Language Server** with:

- **Advanced IntelliSense:** Autocomplete for functions, constants, and variables.
- **Smart Code Navigation (**``**):** Press `Ctrl+Click` to instantly jump to the definition of:
  - Functions (including `public`, `stock`, `native`, and those with an `@` prefix).
  - Constants defined with `#define`.
  - Global variables.
  - **Functions in Tasks:** Navigate directly to the function when its name is passed as a string (e.g., `set_task_ex(..., "my_function", ...)`).
- **Hover Information:** Hover over a function or variable to see its full definition without leaving your current context.
- **Real-time Diagnostics:** The extension warns you if an `#include` cannot be found, helping you fix errors before you even compile.
- **Integrated Compilation:** Compile your plugins directly from VS Code with a single command.

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
3. Compile the project:  
   `npm run compile`
4. Open the project in VS Code and press `F5` to start a debugging session.

## 🙏 Acknowledgements

This project is a continuation and modernization of the incredible work originally done by **KliPPy**. All credit for the solid foundation and the original idea goes to him.

## 📄 License

This project is licensed under the **GPL-3.0**. See the `LICENSE` file for more details.
