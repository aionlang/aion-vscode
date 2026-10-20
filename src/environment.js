'use strict';

const vscode = require('vscode');
const { binaryFor } = require('./compiler');

/** The `aion` command to run, from the `aion.path` setting. */
function getBinary() {
  return binaryFor(vscode.workspace.getConfiguration('aion').get('path'));
}

let told = false;

/**
 * Tell the user once that the compiler cannot be started, and how to point the extension at it.
 * Checking runs on every save, so repeating this would be a nag.
 */
function reportMissing() {
  if (told) return;
  told = true;
  const binary = getBinary();
  vscode.window
    .showWarningMessage(
      `Aion: cannot run \`${binary}\`. Install the compiler or set \`aion.path\` to where it is.`,
      'Open Settings',
    )
    .then((choice) => {
      if (choice === 'Open Settings') vscode.commands.executeCommand('workbench.action.openSettings', 'aion.path');
    });
}

/** Forget that the user was told, after they changed `aion.path`. */
function resetMissing() {
  told = false;
}

module.exports = { getBinary, reportMissing, resetMissing };
