'use strict';

// Expands the `aion.run.command` setting, such as `${aion} run -O3 ${file}`.  No dependency on
// VS Code, so that it can be tested alone.

const path = require('path');

const NAMES = ['aion', 'file', 'fileDirname', 'fileBasename', 'fileBasenameNoExtension', 'workspaceFolder'];

/** A value with a space in it needs quotes to stay one word in any shell. */
function quote(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * The variables a command may use for `file`.
 *
 * @param {string} aion  the compiler command
 * @param {string} file  the Aion file, as a path
 * @param {string | undefined} workspaceFolder
 */
function variablesFor(aion, file, workspaceFolder) {
  const base = path.basename(file);
  return {
    aion,
    file,
    fileDirname: path.dirname(file),
    fileBasename: base,
    fileBasenameNoExtension: base.slice(0, base.length - path.extname(base).length),
    workspaceFolder: workspaceFolder ?? path.dirname(file),
  };
}

/**
 * Replace `${name}` with its value.  Values that contain a space are quoted, and a name that is not
 * one of the variables is left as written, so that a shell's own `${...}` still works.
 *
 * @param {string} template
 * @param {Record<string, string>} variables
 */
function expand(template, variables) {
  return template.replace(/\$\{(\w+)\}/g, (match, name) =>
    NAMES.includes(name) && name in variables ? quote(variables[name]) : match,
  );
}

module.exports = { expand, variablesFor, NAMES };
