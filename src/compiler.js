'use strict';

// Runs the `aion` command line.  No dependency on VS Code, so that it can be tested with a fake
// executable.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** The command to run: the `aion.path` setting, or `aion` from PATH. */
function binaryFor(configured) {
  return configured && configured.trim() ? configured.trim() : 'aion';
}

/**
 * @typedef {object} Result
 * @property {number | null} code    the exit status, null if the process was killed
 * @property {string} output         standard output followed by standard error
 * @property {NodeJS.ErrnoException | undefined} failure  set when the process could not start
 */

/**
 * Run `binary args…` and collect what it prints.
 *
 * @param {string} binary
 * @param {string[]} args
 * @param {{ cwd?: string, timeout?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<Result>}
 */
function run(binary, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(binary, args, {
        cwd: options.cwd,
        windowsHide: true,
        signal: options.signal,
      });
    } catch (failure) {
      resolve({ code: null, output: '', failure });
      return;
    }
    // spawn's own `timeout` option leaves its timer running when the process never starts
    const timer = options.timeout ? setTimeout(() => child.kill(), options.timeout) : undefined;
    let stdout = '';
    let stderr = '';
    let failure;
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      // an aborted or timed-out run is not a failure to start
      if (e.name !== 'AbortError') failure = e;
    });
    // a process that never started still closes, with an errno for a status
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: failure ? null : code, output: stdout + stderr, failure });
    });
  });
}

/** Whether `result` says the compiler is not installed (or not where `aion.path` points). */
function isMissing(result) {
  return Boolean(result.failure && result.failure.code === 'ENOENT');
}

/**
 * Format `text` the way `aion fmt` does.  The command rewrites files, so the text goes through a
 * temporary one.  Resolves with the formatted text, or rejects with why it could not be.
 *
 * @param {string} binary
 * @param {string} text
 * @param {string[]} [prefix]  arguments that go before `fmt`, for tests
 */
async function formatText(binary, text, prefix = []) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aion-fmt-'));
  const file = path.join(dir, 'format.aion');
  try {
    await fs.promises.writeFile(file, text, 'utf8');
    const result = await run(binary, [...prefix, 'fmt', file], { cwd: dir, timeout: 15000 });
    if (result.failure) throw result.failure;
    if (result.code !== 0) throw new Error(result.output.trim() || `aion fmt exited with status ${result.code}`);
    return await fs.promises.readFile(file, 'utf8');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { binaryFor, run, isMissing, formatText };
