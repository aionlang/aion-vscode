'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tokenize, scopeOf } = require('./helpers/tokenize');

const project = (text) => tokenize(text, 'source.aion-project');

test('a project file', async () => {
  const { lines, balanced } = await project(
    [
      '# my app',
      'name = "myapp"',
      'version = "0.1.0"',
      'link = ["sqlite3"]   # system libraries',
      '',
      '[dependencies]',
      'utils = { path = "../utils" }',
      'http  = { git = "https://github.com/someone/http", tag = "v1.2" }',
    ].join('\n'),
  );
  assert.ok(balanced);
  assert.ok(lines[0].every((t) => t.scopes.includes('comment.line.number-sign.aion-project')));
  assert.equal(scopeOf(lines[1], 'name'), 'support.type.property-name.aion-project');
  assert.equal(scopeOf(lines[1], 'myapp'), 'string.quoted.double.aion-project');
  assert.equal(scopeOf(lines[3], 'sqlite3'), 'string.quoted.double.aion-project');
  assert.equal(scopeOf(lines[3], '#'), 'punctuation.definition.comment.aion-project');
  assert.equal(scopeOf(lines[5], 'dependencies'), 'entity.name.section.aion-project');
  assert.equal(scopeOf(lines[6], 'utils'), 'support.type.property-name.aion-project');
  assert.equal(scopeOf(lines[6], 'path'), 'support.type.property-name.aion-project');
  assert.equal(scopeOf(lines[7], 'tag'), 'support.type.property-name.aion-project');
});

test('arrays may span lines and hold comments', async () => {
  const { lines, balanced } = await project('c = [\n  "a.c", # first\n  "b.c",\n]\nname = "x"');
  assert.ok(balanced);
  assert.equal(scopeOf(lines[1], 'a.c'), 'string.quoted.double.aion-project');
  assert.equal(scopeOf(lines[4], 'name'), 'support.type.property-name.aion-project');
});

test('the manifest matches aion.project by exact name', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const language = manifest.contributes.languages.find((l) => l.id === 'aion-project');
  assert.deepEqual(language.filenames, ['aion.project']);
  assert.equal(language.extensions, undefined);
  const aion = manifest.contributes.languages.find((l) => l.id === 'aion');
  assert.deepEqual(aion.extensions, ['.aion']);
});
