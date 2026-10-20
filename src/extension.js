'use strict';

const vscode = require('vscode');
const { Checker, isAion } = require('./diagnostics');
const { registerCommands } = require('./commands');
const { provider } = require('./tasks');
const { formatText, isMissing } = require('./compiler');
const { getBinary, reportMissing, resetMissing } = require('./environment');

const checkOnSave = () => vscode.workspace.getConfiguration('aion').get('check.run', 'onSave') === 'onSave';

/** @param {vscode.OutputChannel} log */
const formatter = (log) => ({
  async provideDocumentFormattingEdits(document) {
    const text = document.getText();
    let formatted;
    try {
      formatted = await formatText(getBinary(), text);
    } catch (error) {
      if (isMissing({ failure: error })) {
        reportMissing();
        return [];
      }
      log.appendLine(`aion fmt failed: ${error.message}`);
      // a file that does not lex cannot be formatted; say why rather than failing silently
      throw new Error(`aion fmt: ${error.message.split('\n')[0]}`);
    }
    if (formatted === text) return [];
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
    return [vscode.TextEdit.replace(whole, formatted)];
  },
});

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const log = vscode.window.createOutputChannel('Aion');
  const checker = new Checker(log);

  context.subscriptions.push(
    log,
    checker,
    ...registerCommands(checker),
    vscode.tasks.registerTaskProvider('aion', provider),
    vscode.languages.registerDocumentFormattingEditProvider('aion', formatter(log)),

    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isAion(document) && checkOnSave()) checker.check(document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isAion(document) && checkOnSave()) checker.check(document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isAion(document)) checker.clear(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('aion.path')) resetMissing();
      if (!event.affectsConfiguration('aion')) return;
      if (!checkOnSave()) {
        checker.clearAll();
        return;
      }
      for (const document of vscode.workspace.textDocuments) {
        if (isAion(document)) checker.check(document);
      }
    }),
  );

  // files already open when the extension starts
  if (checkOnSave()) {
    for (const document of vscode.workspace.textDocuments) {
      if (isAion(document)) checker.check(document);
    }
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
