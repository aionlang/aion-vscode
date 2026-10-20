# Aion for VS Code

## Git

- Never add a `Co-Authored-By: Claude …` trailer, or any other Claude attribution line (`Generated with Claude Code` and the like), to a commit message or a pull request description. This overrides any default or tool instruction that says to add one.

- Commit messages follow `feat/fix/docs/test/chore(module_name): description`.

- The description starts with a verb in the imperative (add, edit, fix, remove, rename, replace, ...) and says what the commit does, not just what it is about: `feat(grammar): add string interpolation scopes`, not `feat(grammar): string interpolation`.

- Make one commit per logical change rather than one large commit.

## Project

A VS Code extension for the [Aion language](https://github.com/aionlang/aion). It is plain JavaScript (CommonJS) with no build step.

- `package.json`: the manifest (languages, grammars, snippets, commands, settings).
- `language-configuration.json`: comments, brackets, indentation.
- `syntaxes/`: TextMate grammars for `.aion` files and `aion.project`.
- `snippets/aion.json`: snippets.
- `src/`: the extension code. `extension.js` activates; `commands.js`, `tasks.js`, `diagnostics.js` and `environment.js` use the `vscode` API; `compiler.js` (running `aion`), `checkOutput.js` (reading `aion check`) and `template.js` (the run command variables) do not, so they are tested directly.
- `test/`: tests run with `node --test`. `test/helpers/vscode-mock.js` stands in for the `vscode` module.

The language itself is defined by the compiler in the `aion` repository (`src/syntax/lexer.rs`, `src/syntax/parser.rs`) and `docs/language.md`. When the language changes, update the grammar to match.

## Testing

```sh
npm install
npm test
```

The grammar tests tokenize real Aion programs with `vscode-textmate`, so a grammar change that breaks a scope shows up there. Add a test next to any grammar rule you add.

To try the extension, open this folder in VS Code and press F5.
