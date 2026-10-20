'use strict';

const path = require('path');
const vscode = require('vscode');
const { run, isMissing } = require('./compiler');
const { parseCheckOutput, describe } = require('./checkOutput');
const { getBinary, reportMissing } = require('./environment');

const isAion = (document) => document.languageId === 'aion' && document.uri.scheme === 'file';

/**
 * Shows what `aion check` finds as problems in the editor.  A run covers one file and the modules
 * it imports, so it may report on other files too; those are remembered so that the next run of
 * the same file can take them back.
 */
class Checker {
  /** @param {vscode.OutputChannel} log */
  constructor(log) {
    this.log = log;
    this.collection = vscode.languages.createDiagnosticCollection('aion');
    /** @type {Map<string, AbortController>} runs in progress, by file */
    this.running = new Map();
    /** @type {Map<string, Set<string>>} the files each run last reported on */
    this.reported = new Map();
  }

  /** @param {vscode.TextDocument} document */
  async check(document) {
    if (!isAion(document)) return;
    const key = document.uri.toString();
    this.running.get(key)?.abort();
    const controller = new AbortController();
    this.running.set(key, controller);

    const cwd = path.dirname(document.fileName);
    const result = await run(getBinary(), ['check', document.fileName], {
      cwd,
      timeout: 60000,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return; // a newer run took over
    this.running.delete(key);

    if (isMissing(result)) {
      this.clear(document.uri);
      reportMissing();
      return;
    }
    this.log.appendLine(`aion check ${document.fileName} -> ${result.code}`);
    this.publish(document, cwd, result);
  }

  publish(document, cwd, result) {
    const key = document.uri.toString();
    /** @type {Map<string, vscode.Diagnostic[]>} */
    const byFile = new Map();
    const add = (uri, diagnostic) => {
      const k = uri.toString();
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(diagnostic);
    };

    const problems = parseCheckOutput(result.output);
    for (const problem of problems) {
      const severity =
        problem.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
      let uri = document.uri;
      let range = new vscode.Range(0, 0, 0, 0);
      if (problem.file && problem.line !== undefined && problem.column !== undefined) {
        uri = vscode.Uri.file(path.resolve(cwd, problem.file));
        const line = problem.line - 1;
        const column = problem.column - 1;
        range = new vscode.Range(line, column, line, column + problem.length);
      }
      const diagnostic = new vscode.Diagnostic(range, describe(problem), severity);
      diagnostic.source = 'aion';
      add(uri, diagnostic);
    }

    // the compiler failed but said nothing we can place: show what it said
    if (problems.length === 0 && result.code !== 0 && result.output.trim()) {
      const text = result.output.trim().slice(0, 500);
      const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), text, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'aion';
      add(document.uri, diagnostic);
    }

    const before = this.reported.get(key) ?? new Set();
    for (const stale of before) {
      if (!byFile.has(stale)) this.collection.delete(vscode.Uri.parse(stale));
    }
    // the checked file is always set, so an empty run clears it
    if (!byFile.has(key)) byFile.set(key, []);
    for (const [file, diagnostics] of byFile) this.collection.set(vscode.Uri.parse(file), diagnostics);
    this.reported.set(key, new Set(byFile.keys()));
  }

  /** Forget everything reported for a file, for instance when it is closed. */
  clear(uri) {
    const key = uri.toString();
    this.running.get(key)?.abort();
    this.running.delete(key);
    for (const file of this.reported.get(key) ?? []) this.collection.delete(vscode.Uri.parse(file));
    this.reported.delete(key);
    this.collection.delete(uri);
  }

  clearAll() {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
    this.reported.clear();
    this.collection.clear();
  }

  dispose() {
    this.clearAll();
    this.collection.dispose();
  }
}

module.exports = { Checker, isAion };
