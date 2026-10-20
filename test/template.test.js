'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { expand, variablesFor } = require('../src/template');

const file = path.join('proj', 'src', 'hello world.aion');

test('variables describe the file', () => {
  const v = variablesFor('aion', file, 'proj');
  assert.equal(v.file, file);
  assert.equal(v.fileDirname, path.join('proj', 'src'));
  assert.equal(v.fileBasename, 'hello world.aion');
  assert.equal(v.fileBasenameNoExtension, 'hello world');
  assert.equal(v.workspaceFolder, 'proj');
});

test('without a workspace the folder of the file stands in', () => {
  assert.equal(variablesFor('aion', file, undefined).workspaceFolder, path.join('proj', 'src'));
});

test('expand fills in the variables and quotes values with spaces', () => {
  const v = variablesFor('aion', file, 'proj');
  assert.equal(expand('${aion} run -O3 ${file}', v), `aion run -O3 "${file}"`);
  assert.equal(expand('${aion} build ${file} -o out/${fileBasenameNoExtension}', v), `aion build "${file}" -o out/"hello world"`);
});

test('a name that is not a variable is left for the shell', () => {
  const v = variablesFor('aion', 'a.aion', undefined);
  assert.equal(expand('echo ${HOME} ${file}', v), 'echo ${HOME} a.aion');
  assert.equal(expand('echo ${toString}', v), 'echo ${toString}');
});

test('a template without variables is unchanged', () => {
  assert.equal(expand('make run', variablesFor('aion', 'a.aion', undefined)), 'make run');
});
