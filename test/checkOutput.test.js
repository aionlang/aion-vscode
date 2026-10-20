'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCheckOutput, describe } = require('../src/checkOutput');

test('an error with a location, an excerpt and a hint', () => {
  const output = [
    'error: undefined variable `oops`',
    ' --> demo.aion:2:10',
    '  |',
    '2 |     x := oops',
    '  |          ^^^^',
    'hint: declare it first',
    '',
  ].join('\n');
  assert.deepEqual(parseCheckOutput(output), [
    {
      severity: 'error',
      message: 'undefined variable `oops`',
      hint: 'declare it first',
      file: 'demo.aion',
      line: 2,
      column: 10,
      length: 4,
    },
  ]);
});

test('the gutter widens with the line number', () => {
  const output = ['error: boom', '    --> src\\main.aion:1234:5', '     |', '1234 | x', '     |     ^'].join('\n');
  const [problem] = parseCheckOutput(output);
  assert.equal(problem.file, 'src\\main.aion');
  assert.equal(problem.line, 1234);
  assert.equal(problem.column, 5);
});

test('a Windows path with a drive letter keeps its colon', () => {
  const [problem] = parseCheckOutput('error: x\n --> C:\\proj\\a.aion:7:3\n  |\n7 | y\n  |   ^');
  assert.equal(problem.file, 'C:\\proj\\a.aion');
  assert.equal(problem.line, 7);
});

test('warnings and several problems in one run', () => {
  const output = [
    'warning: a file named `json` shadows the standard library',
    ' --> a.aion:1:8',
    '  |',
    '1 | import json',
    '  |        ^^^^',
    'error: expected Int, found String',
    ' --> b.aion:3:15',
    '  |',
    '3 |     x: Int := "hello"',
    '  |               ^^^^^^^',
  ].join('\r\n');
  const problems = parseCheckOutput(output);
  assert.deepEqual(
    problems.map((p) => [p.severity, p.file, p.line, p.length]),
    [
      ['warning', 'a.aion', 1, 4],
      ['error', 'b.aion', 3, 7],
    ],
  );
});

test('an error that is not tied to a place has no location', () => {
  const [problem] = parseCheckOutput('error: no such file: nope.aion\n');
  assert.equal(problem.message, 'no such file: nope.aion');
  assert.equal(problem.file, undefined);
  assert.equal(problem.line, undefined);
});

test('text before the first problem and a clean run are ignored', () => {
  assert.deepEqual(parseCheckOutput(''), []);
  assert.deepEqual(parseCheckOutput('checking demo.aion\n --> not:1:1\n'), []);
});

test('the hint is shown after the message', () => {
  const [problem] = parseCheckOutput('error: bad\nhint: try again');
  assert.equal(describe(problem), 'bad\nhint: try again');
  assert.equal(describe({ ...problem, hint: undefined }), 'bad');
});
