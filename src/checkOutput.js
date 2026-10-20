'use strict';

// Reads what `aion check` prints.  The compiler renders a problem as
//
//     error: expected Int, found String
//      --> demo.aion:3:15
//       |
//     3 |     x: Int := "hello"
//       |               ^^^^^^^
//     hint: write an Int here
//
// (see `Diagnostic::render` in the compiler's src/diag.rs).  A problem that is not tied to a place
// has only the first line.  This module has no dependency on VS Code so that it can be tested alone.

/**
 * @typedef {object} Problem
 * @property {'error' | 'warning'} severity
 * @property {string} message
 * @property {string | undefined} hint
 * @property {string | undefined} file   as the compiler printed it
 * @property {number | undefined} line   1-based
 * @property {number | undefined} column 1-based, in characters
 * @property {number} length             characters underlined, at least 1
 */

const HEADER = /^(error|warning): (.*)$/;
const LOCATION = /^\s*--> (.+):(\d+):(\d+)\s*$/;
const CARET = /^\s*\|\s*\^+\s*$/;
const HINT = /^hint: (.*)$/;

/**
 * @param {string} output  the text the compiler wrote, standard output and error together
 * @returns {Problem[]}
 */
function parseCheckOutput(output) {
  /** @type {Problem[]} */
  const problems = [];
  /** @type {Problem | undefined} */
  let current;

  for (const raw of output.split(/\r?\n/)) {
    const header = HEADER.exec(raw);
    if (header) {
      current = {
        severity: /** @type {'error' | 'warning'} */ (header[1]),
        message: header[2],
        hint: undefined,
        file: undefined,
        line: undefined,
        column: undefined,
        length: 1,
      };
      problems.push(current);
      continue;
    }
    if (!current) continue;

    const location = LOCATION.exec(raw);
    if (location) {
      current.file = location[1];
      current.line = Number(location[2]);
      current.column = Number(location[3]);
      continue;
    }
    if (CARET.test(raw)) {
      current.length = Math.max(1, (raw.match(/\^/g) || []).length);
      continue;
    }
    const hint = HINT.exec(raw);
    if (hint) current.hint = hint[1];
  }
  return problems;
}

/** The message as the editor shows it: the compiler's text, then its hint. */
function describe(problem) {
  return problem.hint ? `${problem.message}\nhint: ${problem.hint}` : problem.message;
}

module.exports = { parseCheckOutput, describe };
