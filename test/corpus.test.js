'use strict';

// Tokenizes every program of the Aion repository, when it sits next to this one (or AION_REPO says
// where it is).  A file must leave the grammar at the top level, which catches a begin without an end.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tokenize } = require('./helpers/tokenize');

const repo = process.env.AION_REPO || path.join(__dirname, '..', '..', 'aion');

function aionFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...aionFiles(full));
    else if (entry.name.endsWith('.aion')) found.push(full);
  }
  return found;
}

const skip = fs.existsSync(repo) ? false : `no Aion repository at ${repo}`;

test('every program in the Aion repository tokenizes cleanly', { skip }, async () => {
  const files = aionFiles(repo);
  assert.ok(files.length > 0, 'found no .aion files');
  const unbalanced = [];
  const illegal = [];
  for (const file of files) {
    const { lines, balanced } = await tokenize(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(repo, file).split(path.sep).join('/');
    // the error tests exist to hold mistakes: an unterminated string, a bad escape
    if (rel.startsWith('tests/errors/')) continue;
    if (!balanced) unbalanced.push(rel);
    if (lines.some((l) => l.some((t) => t.scopes.some((s) => s.startsWith('invalid'))))) {
      illegal.push(rel);
    }
  }
  assert.deepEqual(unbalanced, [], 'files that leave a string, comment or list open');
  assert.deepEqual(illegal, [], 'files with a token marked invalid');
});
