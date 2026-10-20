# Aion for VS Code

Language support for [Aion](https://github.com/aionlang/aion), the scripting-style language that compiles to a native binary.

## Features

- **Syntax highlighting** for `.aion` files: comments (nested block comments and `/** */` docs), strings with `$name` and `${expr}` interpolation, triple-quoted and raw strings, characters, all number forms, declarations, types, operators and the standard library's built-ins.
- **`aion.project`** is recognised by its exact file name and has its own highlighting.
- **File icons**: the Aion logo for `.aion` files, and the logo with a gear for `aion.project`. They are used where the active file icon theme has no icon of its own for these files; a theme that does, such as Material Icon Theme, keeps its own.
- **Problems** from `aion check`, shown in the editor when a file is opened or saved.
- **Run Aion File**: a play button in the editor title bar (like the Python extension), the editor and explorer context menus, the command palette, and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> on macOS).
- **Build Aion File**, **Check Aion File**, **Run Aion Tests** and **Open Aion REPL** commands.
- **Format Document** through `aion fmt`, so format-on-save works.
- **Tasks**: an `aion` task type with a problem matcher, so errors from a build link back to the code.
- **Snippets** for functions, types, `when`, loops, `try`, tasks and more.
- Bracket matching, auto-closing pairs, comment toggling, indentation and `// region` folding.

## Requirements

The `aion` compiler must be installed and on your `PATH`, or `aion.path` must point at it. See the [Aion repository](https://github.com/aionlang/aion) for installation. Highlighting and snippets work without it.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `aion.path` | `aion` | The compiler to run: a command on `PATH` or a full path. |
| `aion.compilerArgs` | `[]` | Options for the compiler when running or building, e.g. `["-O3", "--no-trace"]`. |
| `aion.run.programArgs` | `[]` | Arguments passed to your program (read with `args()`). |
| `aion.run.command` | empty | A command line to run in the terminal instead of `aion run`. See below. |
| `aion.saveBeforeRun` | `true` | Save the file before running, building or checking it. |
| `aion.check.run` | `onSave` | `onSave` checks files when opened and saved; `never` checks only on request. |

### A custom run command

By default Run Aion File runs `aion run -O… <file> -- <args>` as a VS Code task. Set `aion.run.command` to run something else in the integrated terminal:

```json
{
  "aion.run.command": "${aion} run -O3 ${file}"
}
```

Variables: `${aion}` (the compiler, from `aion.path`), `${file}`, `${fileDirname}`, `${fileBasename}`, `${fileBasenameNoExtension}` and `${workspaceFolder}`. A value with a space in it is quoted. Any other `${...}` is left for your shell.

### Tasks

```json
{
  "version": "2.0.0",
  "tasks": [
    { "type": "aion", "command": "run", "file": "${file}", "flags": ["-O3"], "args": ["--verbose"], "label": "run optimised" },
    { "type": "aion", "command": "test", "group": "test", "label": "aion test" }
  ]
}
```

`command` is one of `run`, `build`, `check` and `test`. Without `file`, the project (`aion.project`) is used.

## Development

```sh
npm install
npm test
```

Open the folder in VS Code and press F5 to start an Extension Development Host. The extension is plain JavaScript with no build step. `npm test` also tokenizes every program in a neighbouring checkout of the Aion repository (`../aion`, or the path in `AION_REPO`) to check the grammar against real code.

The icons come from `node scripts/make-icons.js`, which draws the logo and the gear into `icons/`.

Package it with `npx @vscode/vsce package`.

## License

Apache-2.0. See [LICENSE](LICENSE).
