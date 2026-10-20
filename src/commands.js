'use strict';

const vscode = require('vscode');
const { isAion } = require('./diagnostics');
const { createTask } = require('./tasks');
const { getBinary } = require('./environment');
const { expand, variablesFor } = require('./template');

const settings = () => vscode.workspace.getConfiguration('aion');

/**
 * The Aion file the command applies to: the one being edited (or the one the command was given,
 * from the editor's title bar or the explorer), saved first.  Undefined if there is none.
 */
async function currentFile(uri) {
  const document = uri
    ? await vscode.workspace.openTextDocument(uri)
    : vscode.window.activeTextEditor?.document;
  if (!document || !isAion(document)) {
    vscode.window.showInformationMessage('Open an Aion file first.');
    return undefined;
  }
  if (document.isDirty && settings().get('saveBeforeRun', true) && !(await document.save())) return undefined;
  return document;
}

let terminal;

/** Run a command line from the `aion.run.command` setting in the Aion terminal. */
function runInTerminal(template, document) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const text = expand(template, variablesFor(getBinary(), document.fileName, folder?.uri.fsPath));
  if (!terminal || terminal.exitStatus !== undefined) {
    terminal = vscode.window.createTerminal({ name: 'Aion', cwd: folder?.uri.fsPath });
  }
  terminal.show(true);
  terminal.sendText(text);
}

function scopeFor(document) {
  return vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.TaskScope.Workspace;
}

/** @returns {vscode.Disposable[]} */
function registerCommands(checker) {
  const onFile = (command) => async (uri) => {
    const document = await currentFile(uri);
    if (!document) return;
    const custom = command === 'run' ? settings().get('run.command', '').trim() : '';
    if (custom) {
      runInTerminal(custom, document);
      return;
    }
    const definition = {
      type: 'aion',
      command,
      file: document.fileName,
      flags: command === 'check' ? [] : settings().get('compilerArgs', []),
      args: command === 'run' ? settings().get('run.programArgs', []) : [],
    };
    await vscode.tasks.executeTask(createTask(definition, scopeFor(document)));
  };

  return [
    vscode.commands.registerCommand('aion.run', onFile('run')),
    vscode.commands.registerCommand('aion.build', onFile('build')),
    vscode.commands.registerCommand('aion.check', async (uri) => {
      const document = await currentFile(uri);
      if (document) await checker.check(document);
    }),
    vscode.commands.registerCommand('aion.test', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      await vscode.tasks.executeTask(
        createTask({ type: 'aion', command: 'test' }, folder ?? vscode.TaskScope.Workspace),
      );
    }),
    vscode.commands.registerCommand('aion.format', () =>
      vscode.commands.executeCommand('editor.action.formatDocument'),
    ),
    vscode.commands.registerCommand('aion.repl', () => {
      const terminal = vscode.window.createTerminal({
        name: 'Aion REPL',
        shellPath: getBinary(),
        shellArgs: ['repl'],
      });
      terminal.show();
    }),
  ];
}

module.exports = { registerCommands };
