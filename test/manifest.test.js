'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = read('package.json');

test('every file the manifest points at exists', () => {
  const { languages, grammars, snippets } = manifest.contributes;
  const files = [
    ...languages.map((l) => l.configuration),
    ...grammars.map((g) => g.path),
    ...snippets.map((s) => s.path),
  ];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
  if (manifest.main) assert.ok(fs.existsSync(path.join(root, manifest.main)), `${manifest.main} is missing`);
});

test('snippets have a prefix and a body, and no two share a prefix', () => {
  const snippets = read('snippets/aion.json');
  const seen = new Map();
  for (const [name, snippet] of Object.entries(snippets)) {
    assert.ok(snippet.prefix, `${name} has no prefix`);
    assert.ok(snippet.body, `${name} has no body`);
    assert.ok(snippet.description, `${name} has no description`);
    for (const prefix of [].concat(snippet.prefix)) {
      assert.ok(!seen.has(prefix), `${name} and ${seen.get(prefix)} both use ${prefix}`);
      seen.set(prefix, name);
    }
  }
});

test('regular expressions in the language configuration compile', () => {
  for (const file of ['language-configuration.json', 'aion-project-configuration.json']) {
    const config = read(file);
    const patterns = [
      config.wordPattern,
      ...Object.values(config.indentationRules || {}),
      ...(config.onEnterRules || []).flatMap((r) => [r.beforeText, r.afterText, r.previousLineText]),
      ...Object.values((config.folding && config.folding.markers) || {}),
    ].filter(Boolean);
    for (const pattern of patterns) new RegExp(pattern);
  }
});
