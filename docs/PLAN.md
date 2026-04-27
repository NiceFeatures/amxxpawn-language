# PLAN: Parser Audit and Verification (v1.4.0)

## 1. ANALYSIS
- **Target**: `src/server/parser.ts` (specifically `doHover` and `doDefinition`).
- **Issues Addressed**:
    - Missing local variable support in Hover and Go to Definition.
    - Global symbol resolution bug: line collision across different files (missing URI check).
    - Recent high-frequency bugfixes (risk of regressions).
- **Stakeholders**: Users of the AMXX Pawn Language Server.
- **Success Criteria**: 
    - Hover works for local variables.
    - Go to Definition works for local variables.
    - Hover/Definition don't break when multiple files have symbols on the same line number.
    - No regressions in function detection or existing highlighting.

## 2. PLANNING (Audit Strategy)
- **Phase A: Code Review (security-auditor)**
    - Inspect the regex and logic used for local variable extraction.
    - Verify `scopeStartLine` and `scopeEndLine` calculations.
    - Audit the URI comparison logic in `doHover` and `doDefinition`.
- **Phase B: Functional Testing (test-engineer)**
    - Create a test script to simulate LSP calls for local variables.
    - Test edge cases: variables with same names in different scopes.
    - Test edge cases: symbols with same line numbers in different files.
- **Phase C: Regression Suite (test-engineer)**
    - Verify function detection (forward/native/public/stock).
    - Verify semantic token generation.

## 3. SOLUTIONING
- **Tools**: 
    - Internal test runner (if available) or a custom Node.js script to call `Parser.parse` and then `Parser.doHover/doDefinition`.
    - `grep_search` to find all variable patterns.
- **Verification Scripts**:
    - `.agent/skills/lint-and-validate/scripts/lint_runner.py`
    - `.agent/skills/vulnerability-scanner/scripts/security_scan.py`

## 4. IMPLEMENTATION
- [ ] **Task 1**: Security audit of `src/server/parser.ts`.
- [ ] **Task 2**: Implement automated tests for local variable hover/definition.
- [ ] **Task 3**: Run the full verification suite (lint, security, tests).
- [ ] **Task 4**: Final documentation update in `CHANGELOG.md`.

---
*Created by project-planner agent*
