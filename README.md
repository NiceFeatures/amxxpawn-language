# AMXXPawn Language - Extended

<p align="center">
  <img src="images/extension-logo.png" alt="AMXXPawn Language Extended Logo" width="128">
  <h1 align="center">AMXXPawn Language - Extended</h1>
</p>

<p align="center">
  <strong>Uma experiência de desenvolvimento moderna e estendida para a clássica linguagem AMXXPawn, diretamente no seu VS Code.</strong>
</p>

> [!IMPORTANT]
> **DISCLAIMER:** This extension ("AMXXPawn Language - Extended") is a **fork** of the original [AMXXPawn Language](https://marketplace.visualstudio.com/items?itemName=KliPPy.amxxpawn-language) extension by KliPPy. It is not affiliated with the original author. This fork includes specific enhancements for local workflows, improved compilation tasks, and targeted syntax additions that are not present in the original version.

<p align="center">
    <a href="https://marketplace.visualstudio.com/items?itemName=iceeedR.amxx-pawn-language-editor">
        <img alt="Visual Studio Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/iceeedR.amxx-pawn-language-editor?style=for-the-badge&label=Marketplace">
    </a>
    <a href="https://marketplace.visualstudio.com/items?itemName=iceeedR.amxx-pawn-language-editor">
        <img alt="Visual Studio Marketplace Installs" src="https://img.shields.io/visual-studio-marketplace/i/iceeedR.amxx-pawn-language-editor?style=for-the-badge&color=blue">
    </a>
</p>

---

Este projeto ressuscita e moderniza a experiência de desenvolvimento para scripters de **AMX Mod X**. Se você ama criar plugins para Half-Life, Counter-Strike 1.6 e outros mods GoldSrc, mas sente falta das ferramentas modernas, esta extensão é para você.

Ela transforma o VS Code em uma IDE poderosa para Pawn, trazendo funcionalidades que antes eram exclusivas de linguagens mais novas.

## ✨ Funcionalidades Principais (Versão Extended)

Diferente do original, esta versão **Extended** traz otimizações focadas em workflows locais e customizados, juntamente com todas as ferramentas de **Language Server**:

* **IntelliSense Avançado:** Autocompletar para funções, constantes e variáveis.
* **Navegação de Código Inteligente (`Go to Definition`):** Pressione `Ctrl+Click` para pular instantaneamente para a definição de:
    * Funções (incluindo `public`, `stock`, `native` e com prefixo `@`).
    * Constantes definidas com `#define`.
    * Variáveis globais.
    * **Funções em Tasks:** Navegue diretamente para a função quando o nome dela é passado como texto (ex: `set_task_ex(..., "minha_funcao", ...)`).
* **Informações ao Passar o Mouse (Hover):** Passe o mouse sobre uma função ou variável para ver sua definição completa sem sair do lugar.
* **Diagnósticos em Tempo Real:** A extensão avisa se um `#include` não pode ser encontrado, ajudando a corrigir erros antes mesmo de compilar.
* **Compilação Integrada:** Compile seus plugins diretamente do VS Code com um único comando.

## 🚀 Instalação

1.  Instale o [Visual Studio Code](https://code.visualstudio.com/).
2.  Abra a aba de **Extensões** (`Ctrl+Shift+X`).
3.  Procure por `AMXXPawn Language Service`.
4.  Clique em **Instalar**.
5.  Recarregue o VS Code e aproveite!

Você também pode instalar diretamente pela [página do Marketplace](https://marketplace.visualstudio.com/items?itemName=iceeedR.amxx-pawn-language-editor).

## ⚙️ Configuração (Passo Essencial!)

Para que a extensão funcione 100%, você **precisa** dizer a ela onde seu compilador AMXX e os arquivos de `include` estão.

1.  Abra as Configurações do VS Code (`Ctrl + ,`).
2.  Clique no ícone de "Abrir settings.json" no canto superior direito.
3.  Adicione as seguintes propriedades ao seu `settings.json`:

```json
{
    // ...outras configurações...

    // Caminho para o executável do compilador amxxpc.
    "amxxpawn.compiler.executablePath": "C:\\caminho\\para\\seu\\compiler\\amxxpc.exe",

    // Lista de pastas onde a extensão deve procurar por arquivos .inc.
    // ESSENCIAL para o "Go to Definition" de funções nativas funcionar.
    "amxxpawn.compiler.includePaths": [
        "C:\\caminho\\para\\seu\\compiler\\include"
    ]

    // --- CONFIGURAÇÃO RECOMENDADA ---
    // Para uma experiência de autocomplete mais limpa e inteligente,
    // desativando sugestões genéricas baseadas em palavras do arquivo.
    "editor.wordBasedSuggestions": "off"
}
```

**IMPORTANTE para usuários Windows:** Em arquivos JSON, você deve usar barras invertidas duplas (`\\`) ou barras normais (`/`) nos caminhos.

**Exemplo Prático:**
```json
{
    "amxxpawn.compiler.executablePath": "C:/AMXX/compiler/amxxpc.exe",
    "amxxpawn.compiler.includePaths": [
        "C:/AMXX/compiler/include"
    ]
}
```

## ⌨️ Comandos Disponíveis

Abra a Paleta de Comandos (`Ctrl+Shift+P`) e digite `AMXXPawn` para ver os comandos disponíveis:

* **`AMXXPawn: Compile Plugin`:** Compila o arquivo `.sma` atualmente aberto usando o `executablePath` definido nas configurações.
* **`AMXXPawn: Compile Plugin Local`:** Procura e usa um `amxxpc.exe` que esteja na mesma pasta do arquivo `.sma` que você está editando.

## 🛠️ Para Desenvolvedores e Contribuidores

Este projeto é uma modernização de uma base de código legada, agora utilizando TypeScript e as APIs mais recentes do `vscode-languageclient`. Contribuições são muito bem-vindas!

**Para compilar e testar localmente:**

1.  Clone o repositório: `git clone https://github.com/NiceFeatures/amxxpawn-language.git`
2.  Instale as dependências: `npm install`
3.  Compile o projeto: `npm run compile`
4.  Abra o projeto no VS Code e pressione `F5` para iniciar uma sessão de depuração.

## 🙏 Agradecimentos

Este projeto é uma continuação e modernização do trabalho incrível feito originalmente por **KliPPy**. Todo o crédito pela base sólida e pela ideia original vai para ele.

## 📄 Licença

Este projeto é licenciado sob a **GPL-3.0**. Veja o arquivo `LICENSE` para mais detalhes.
