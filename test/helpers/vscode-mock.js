'use strict';

// A small stand-in for the `vscode` module, enough to load the extension and watch what it does.
// `install()` must run before anything under src/ is required.

const Module = require('module');
const path = require('path');

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(a, b, c, d) {
    const pair = typeof a === 'number';
    this.start = pair ? new Position(a, b) : a;
    this.end = pair ? new Position(c, d) : b;
  }
}

class Location {
  constructor(uri, range) {
    Object.assign(this, { uri, range });
  }
}

class Diagnostic {
  constructor(range, message, severity) {
    Object.assign(this, { range, message, severity });
  }
}

const Uri = {
  file: (fsPath) => ({ scheme: 'file', fsPath, toString: () => `file:///${fsPath.replace(/\\/g, '/')}` }),
  parse(text) {
    const fsPath = text.replace(/^file:\/\/\//, '').replace(/\//g, path.sep);
    return Uri.file(fsPath);
  },
};

/** Create a fresh mock; `state` collects what the code under test did. */
function create(config = {}) {
  const state = {
    commands: new Map(),
    diagnostics: new Map(),
    warnings: [],
    informations: [],
    executedTasks: [],
    terminals: [],
    sent: [],
    formatters: [],
    definitionProviders: [],
    taskProviders: [],
    listeners: {},
    config,
  };
  const disposable = { dispose() {} };
  const listen = (name) => (fn) => {
    (state.listeners[name] ??= []).push(fn);
    return disposable;
  };

  const vscode = {
    Position,
    Range,
    Location,
    Diagnostic,
    Uri,
    Disposable: class {},
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    TextEdit: { replace: (range, newText) => ({ range, newText }) },
    TaskScope: { Global: 1, Workspace: 2 },
    TaskGroup: { Build: 'build', Test: 'test' },
    TaskRevealKind: { Always: 1 },
    ProcessExecution: class {
      constructor(process, args, options) {
        Object.assign(this, { process, args, options });
      }
    },
    Task: class {
      constructor(definition, scope, name, source, execution, problemMatchers) {
        Object.assign(this, { definition, scope, name, source, execution, problemMatchers });
      }
    },
    window: {
      activeTextEditor: undefined,
      createOutputChannel: () => ({ lines: [], appendLine(l) { this.lines.push(l); }, dispose() {} }),
      showWarningMessage: (message, ...items) => {
        state.warnings.push(message);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (message) => {
        state.informations.push(message);
        return Promise.resolve(undefined);
      },
      createTerminal: (options) => {
        const terminal = {
          options,
          exitStatus: undefined,
          show() {},
          sendText: (text) => state.sent.push(text),
        };
        state.terminals.push(terminal);
        return terminal;
      },
    },
    workspace: {
      workspaceFolders: undefined,
      textDocuments: [],
      getConfiguration: () => ({
        get: (key, fallback) => (key in state.config ? state.config[key] : fallback),
      }),
      getWorkspaceFolder: () => undefined,
      openTextDocument: async (uri) => ({ uri, fileName: uri.fsPath, languageId: 'aion', isDirty: false }),
      onDidSaveTextDocument: listen('save'),
      onDidOpenTextDocument: listen('open'),
      onDidCloseTextDocument: listen('close'),
      onDidChangeConfiguration: listen('config'),
    },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri, diagnostics) => state.diagnostics.set(uri.toString(), diagnostics),
        delete: (uri) => state.diagnostics.delete(uri.toString()),
        clear: () => state.diagnostics.clear(),
        dispose() {},
      }),
      registerDocumentFormattingEditProvider: (language, provider) => {
        state.formatters.push({ language, provider });
        return disposable;
      },
      registerDefinitionProvider: (selector, provider) => {
        state.definitionProviders.push({ selector, provider });
        return disposable;
      },
    },
    commands: {
      registerCommand: (id, fn) => {
        state.commands.set(id, fn);
        return disposable;
      },
      executeCommand: async () => undefined,
    },
    tasks: {
      registerTaskProvider: (type, provider) => {
        state.taskProviders.push({ type, provider });
        return disposable;
      },
      executeTask: async (task) => {
        state.executedTasks.push(task);
      },
    },
  };
  return { vscode, state };
}

/** Make `require('vscode')` give `vscode`, and forget the extension's modules so they see it. */
function install(vscode) {
  const src = path.join(__dirname, '..', '..', 'src') + path.sep;
  for (const key of Object.keys(require.cache)) if (key.startsWith(src)) delete require.cache[key];
  const load = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'vscode' ? vscode : load.call(this, request, ...rest);
  };
  return () => {
    Module._load = load;
  };
}

/** A document the extension would treat as an Aion file on disk. */
function aionDocument(fsPath, text = '') {
  return {
    uri: Uri.file(fsPath),
    fileName: fsPath,
    languageId: 'aion',
    isDirty: false,
    getText: () => text,
    positionAt: (offset) => new Position(0, offset),
    save: async () => true,
  };
}

module.exports = { create, install, aionDocument };
