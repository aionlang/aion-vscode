# Changelog

## Unreleased

- Highlight the format spec of `${value:spec}` in string interpolation.
- Add the commands **Open Documentation** and **Search Documentation for the Word at the Cursor**, which open the online documentation.

## 0.3.0

- Go to Definition follows imports into dependencies: `path` dependencies, and git dependencies downloaded into the project's `aion-dependencies/` folder by `aion install` (the folder is named in `packages` in `aion.project`, the commit comes from `aion.lock`). Git dependencies in the shared cache, and the dependencies of a dependency, are not followed.

## 0.2.0

- Go to Definition for functions, types, interfaces, enums and their variants, variables, parameters, fields, methods and imports.

## 0.1.0

First release.

- Syntax highlighting for Aion and for `aion.project`.
- Language configuration: comments, brackets, auto-closing pairs, indentation and folding.
- File icons for `.aion` and `aion.project`.
- Snippets.
- Problems from `aion check` on open and save.
- Run, build, check, test and REPL commands, the Run Aion File button, and a custom run command setting.
- Formatting through `aion fmt`.
- The `aion` task type and a problem matcher.
