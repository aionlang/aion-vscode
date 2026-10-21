'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { create, install } = require('./helpers/vscode-mock');
const { PAGES, SITE, pageFor } = require('../src/docs');

test('every documentation page is a link to the site or the repository', () => {
  assert.ok(PAGES.length >= 8);
  for (const { label, url } of PAGES) {
    assert.ok(label && /^https:\/\/(aionlang\.github\.io\/documentation|github\.com\/aionlang\/aion\/blob\/main\/docs)/.test(url), url);
  }
});

test('words lead to the page that explains them', () => {
  assert.equal(pageFor('when'), `${SITE}/syntax`);
  assert.equal(pageFor('enum'), `${SITE}/types`);
  assert.equal(pageFor('vararg'), `${SITE}/functions`);
  assert.equal(pageFor('defer'), `${SITE}/errors-and-concurrency`);
  assert.equal(pageFor('regex'), `${SITE}/stdlib`);
  assert.equal(pageFor('List'), `${SITE}/prelude-methods`);
  assert.equal(pageFor('nonsense'), undefined);
});

function load(word, pick) {
  const { vscode, state } = create();
  const restore = install(vscode);
  state.pick = pick;
  vscode.window.activeTextEditor = {
    selection: { active: {} },
    document: { getWordRangeAtPosition: () => (word ? {} : undefined), getText: () => word },
  };
  const registered = require('../src/commands').registerCommands({});
  return { state, restore, registered };
}

test('"Search Documentation" opens the page for the word at the cursor', async (t) => {
  const { state, restore } = load('defer');
  t.after(restore);
  await state.commands.get('aion.searchDocumentation')();
  assert.deepEqual(state.opened, [`${SITE}/errors-and-concurrency`]);
});

test('without a known word the list of pages is offered', async (t) => {
  const { state, restore } = load('mystery', 'Syntax');
  t.after(restore);
  await state.commands.get('aion.searchDocumentation')();
  assert.deepEqual(state.opened, [`${SITE}/syntax`]);
  state.opened.length = 0;
  state.pick = undefined; // the picker is dismissed
  await state.commands.get('aion.openDocumentation')();
  assert.deepEqual(state.opened, []);
});
