'use strict';

const fs = require('fs');
const vscode = require('vscode');
const { SymbolIndex, findDefinitions, projectRoot } = require('./lookup');

const isFile = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/** A file's text: what the editor holds if it is open, else what is on disk. */
function readFile(file) {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === file);
  if (open) return open.getText();
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Go to Definition (Ctrl+Click, F12) for names, types, functions and modules. */
function definitionProvider() {
  const index = new SymbolIndex(readFile);
  return {
    provideDefinition(document, position) {
      const file = document.uri.fsPath;
      const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
      const found = findDefinitions({
        file,
        text: document.getText(),
        line: position.line,
        character: position.character,
        index,
        exists: isFile,
        root: projectRoot(file, isFile, folder),
      });
      return found.map(
        (at) => new vscode.Location(vscode.Uri.file(at.file), new vscode.Range(at.line, at.character, at.line, at.character + at.length)),
      );
    },
  };
}

module.exports = { definitionProvider };
