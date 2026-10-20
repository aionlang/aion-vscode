'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { create, install, aionDocument } = require('./helpers/vscode-mock');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const dir = path.join(__dirname, 'fixtures');
const main = path.join(dir, 'main.aion');
const util = path.join(dir, 'util.aion');

/** Load the extension against a fresh mock; `restore` must run when the test ends. */
function load(config) {
  const { vscode, state } = create(config);
  const restore = install(vscode);
  const modules = {
    extension: require('../src/extension'),
    diagnostics: require('../src/diagnostics'),
    tasks: require('../src/tasks'),
    commands: require('../src/commands'),
  };
  return { vscode, state, modules, restore };
}

const output = (lines) => lines.join('\n');
const failed = {
  code: 1,
  output: output([
    'error: expected Int, found String',
    ` --> ${main}:3:15`,
    '  |',
    '3 |     x: Int := "hello"',
    '  |               ^^^^^^^',
    'hint: write an Int',
    'warning: unused import',
    ` --> ${util}:1:8`,
    '  |',
    '1 | import json',
    '  |        ^^^^',
  ]),
};

test('activation registers every command the manifest declares', (t) => {
  const { state, modules, restore } = load();
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  for (const { command } of manifest.contributes.commands) {
    assert.ok(state.commands.has(command), `${command} is not registered`);
  }
  assert.equal(state.formatters[0].language, 'aion');
  assert.equal(state.taskProviders[0].type, 'aion');
});

test('problems appear where the compiler said, in the file it named', async (t) => {
  const { state, vscode, modules, restore } = load();
  t.after(restore);
  const checker = new modules.diagnostics.Checker(vscode.window.createOutputChannel(), async () => failed);
  await checker.check(aionDocument(main));

  const here = state.diagnostics.get(vscode.Uri.file(main).toString());
  assert.equal(here.length, 1);
  assert.equal(here[0].message, 'expected Int, found String\nhint: write an Int');
  assert.equal(here[0].severity, vscode.DiagnosticSeverity.Error);
  assert.deepEqual(
    [here[0].range.start.line, here[0].range.start.character, here[0].range.end.character],
    [2, 14, 21],
  );

  const there = state.diagnostics.get(vscode.Uri.file(util).toString());
  assert.equal(there[0].severity, vscode.DiagnosticSeverity.Warning);
  assert.equal(there[0].range.start.line, 0);
});

test('a clean run takes back what the last one reported, in every file', async (t) => {
  const { state, vscode, modules, restore } = load();
  t.after(restore);
  let result = failed;
  const checker = new modules.diagnostics.Checker(vscode.window.createOutputChannel(), async () => result);
  const document = aionDocument(main);
  await checker.check(document);
  result = { code: 0, output: '' };
  await checker.check(document);
  assert.deepEqual(state.diagnostics.get(vscode.Uri.file(main).toString()), []);
  assert.equal(state.diagnostics.has(vscode.Uri.file(util).toString()), false);
});

test('a failure with nothing to point at is shown on the first line', async (t) => {
  const { state, vscode, modules, restore } = load();
  t.after(restore);
  const checker = new modules.diagnostics.Checker(
    vscode.window.createOutputChannel(),
    async () => ({ code: 2, output: 'something went wrong\n' }),
  );
  await checker.check(aionDocument(main));
  const [diagnostic] = state.diagnostics.get(vscode.Uri.file(main).toString());
  assert.equal(diagnostic.message, 'something went wrong');
});

test('a missing compiler is reported once, however many files are saved', async (t) => {
  const { state, vscode, modules, restore } = load({ path: 'no-such-aion' });
  t.after(restore);
  const missing = async () => ({ code: null, output: '', failure: Object.assign(new Error('x'), { code: 'ENOENT' }) });
  const checker = new modules.diagnostics.Checker(vscode.window.createOutputChannel(), missing);
  await checker.check(aionDocument(main));
  await checker.check(aionDocument(util));
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0], /no-such-aion/);
});

test('files that are not Aion are left alone', async (t) => {
  const { state, vscode, modules, restore } = load();
  t.after(restore);
  let ran = false;
  const checker = new modules.diagnostics.Checker(vscode.window.createOutputChannel(), async () => {
    ran = true;
    return failed;
  });
  await checker.check({ ...aionDocument(main), languageId: 'plaintext' });
  assert.equal(ran, false);
  assert.equal(state.diagnostics.size, 0);
});

test('saving an Aion file checks it unless checking is off', async (t) => {
  const { state, modules, restore } = load({ 'check.run': 'never' });
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  // nothing may run: with the setting at `never` the listener must do nothing, and the stand-in
  // mock has no compiler, which would have shown a warning
  for (const save of state.listeners.save) save(aionDocument(main));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(state.warnings, []);
});

test('Run Aion File runs `aion run` on the file with the settings', async (t) => {
  const { state, vscode, modules, restore } = load({
    path: 'aion',
    compilerArgs: ['-O3'],
    'run.programArgs': ['--fast', 'x'],
  });
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  await state.commands.get('aion.run')(vscode.Uri.file(main));
  const [task] = state.executedTasks;
  assert.equal(task.execution.process, 'aion');
  assert.deepEqual(task.execution.args, ['run', '-O3', main, '--', '--fast', 'x']);
  assert.equal(task.problemMatchers, '$aion');
  assert.equal(task.source, 'aion');
});

test('Build Aion File takes the compiler flags but not the program arguments', async (t) => {
  const { state, vscode, modules, restore } = load({ compilerArgs: ['-O1'], 'run.programArgs': ['x'] });
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  await state.commands.get('aion.build')(vscode.Uri.file(main));
  assert.deepEqual(state.executedTasks[0].execution.args, ['build', '-O1', main]);
});

test('a custom run command goes to the terminal with its variables filled in', async (t) => {
  const { state, vscode, modules, restore } = load({ path: '/opt/aion', 'run.command': '${aion} run -O3 ${file}' });
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  await state.commands.get('aion.run')(vscode.Uri.file(main));
  assert.deepEqual(state.sent, [`/opt/aion run -O3 ${main}`]);
  assert.equal(state.executedTasks.length, 0);

  await state.commands.get('aion.run')(vscode.Uri.file(main));
  assert.equal(state.terminals.length, 1, 'the terminal is reused');
});

test('the aion.path setting decides what is run', async (t) => {
  const { state, vscode, modules, restore } = load({ path: ' C:\\tools\\aion.exe ' });
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  await state.commands.get('aion.run')(vscode.Uri.file(main));
  assert.equal(state.executedTasks[0].execution.process, 'C:\\tools\\aion.exe');
});

test('Run Aion File without an Aion file open says so', async (t) => {
  const { state, modules, restore } = load();
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  await state.commands.get('aion.run')();
  assert.deepEqual(state.informations, ['Open an Aion file first.']);
  assert.equal(state.executedTasks.length, 0);
});

test('the task provider offers the project commands and resolves a task from tasks.json', (t) => {
  const { vscode, modules, restore } = load();
  t.after(restore);
  vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(dir), name: 'fixtures' }];
  const offered = modules.tasks.provider.provideTasks();
  assert.deepEqual(offered.map((x) => x.definition.command), ['run', 'build', 'check', 'test']);
  assert.equal(offered[0].execution.options.cwd, dir);

  const resolved = modules.tasks.provider.resolveTask({
    definition: { type: 'aion', command: 'run', file: main, flags: ['-O2'], args: ['a'] },
    scope: vscode.TaskScope.Workspace,
  });
  assert.deepEqual(resolved.execution.args, ['run', '-O2', main, '--', 'a']);
  assert.equal(modules.tasks.provider.resolveTask({ definition: { type: 'aion', command: 'nope' } }), undefined);
});

test('formatting without a compiler asks the user to set it up and changes nothing', async (t) => {
  const { state, vscode, modules, restore } = load({ path: 'no-such-aion-binary' });
  t.after(restore);
  modules.extension.activate({ subscriptions: [] });
  const edits = await state.formatters[0].provider.provideDocumentFormattingEdits(aionDocument(main, 'x := 1  \n'));
  assert.deepEqual(edits, []);
  assert.equal(state.warnings.length, 1);
});
