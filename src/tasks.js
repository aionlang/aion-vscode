'use strict';

const path = require('path');
const vscode = require('vscode');
const { getBinary } = require('./environment');

const COMMANDS = ['run', 'build', 'check', 'test'];

/**
 * @typedef {object} AionTaskDefinition
 * @property {string} type
 * @property {'run' | 'build' | 'check' | 'test'} command
 * @property {string} [file]  the program; left out, the project's entry (or tests) is used
 * @property {string[]} [flags]  compiler options such as `-O3`, before the file
 * @property {string[]} [args]  after the file; for `run` they go to the program
 */

/**
 * @param {AionTaskDefinition} definition
 * @param {vscode.WorkspaceFolder | vscode.TaskScope} scope
 * @param {string} [cwd]
 */
function createTask(definition, scope, cwd) {
  const args = [definition.command, ...(definition.flags ?? [])];
  if (definition.file) args.push(definition.file);
  if (definition.args?.length) args.push('--', ...definition.args);
  const folder = typeof scope === 'object' && 'uri' in scope ? scope.uri.fsPath : undefined;
  const workingDirectory = cwd ?? folder ?? (definition.file ? path.dirname(definition.file) : undefined);

  const label = definition.file ? `${definition.command} ${path.basename(definition.file)}` : definition.command;
  const task = new vscode.Task(
    definition,
    scope,
    label,
    'aion',
    new vscode.ProcessExecution(getBinary(), args, { cwd: workingDirectory }),
    '$aion',
  );
  if (definition.command === 'build') task.group = vscode.TaskGroup.Build;
  if (definition.command === 'test') task.group = vscode.TaskGroup.Test;
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, clear: true };
  return task;
}

/** Offers `aion run`, `build`, `check` and `test` for each workspace folder, on the project. */
const provider = {
  provideTasks() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.flatMap((folder) =>
      COMMANDS.map((command) => createTask({ type: 'aion', command }, folder)),
    );
  },
  resolveTask(task) {
    const definition = task.definition;
    if (!COMMANDS.includes(definition.command)) return undefined;
    return createTask(definition, task.scope ?? vscode.TaskScope.Workspace);
  },
};

module.exports = { createTask, provider, COMMANDS };
