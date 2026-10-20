'use strict';

const fs = require('fs');
const path = require('path');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

const root = path.join(__dirname, '..', '..');

const wasm = fs.readFileSync(path.join(root, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm')).buffer;
const onigLib = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
  createOnigString: (s) => new oniguruma.OnigString(s),
}));

const grammarFiles = {
  'source.aion': 'syntaxes/aion.tmLanguage.json',
  'source.aion-project': 'syntaxes/aion-project.tmLanguage.json',
};

const registry = new vsctm.Registry({
  onigLib,
  loadGrammar: async (scopeName) => {
    const file = grammarFiles[scopeName];
    if (!file) return null;
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    return vsctm.parseRawGrammar(content, path.join(root, file));
  },
});

/**
 * Tokenize `text` with the grammar for `scopeName`.
 *
 * Returns the tokens of every line as `{ text, scopes }` (outermost scope first; a token with no
 * rule of its own has only `source.aion`), and
 * whether the grammar was back at the top level at the end, that is, every begin had its end.
 */
async function tokenize(text, scopeName = 'source.aion') {
  const grammar = await registry.loadGrammar(scopeName);
  const lines = text.split('\n');
  let stack = vsctm.INITIAL;
  const out = [];
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, stack);
    out.push(
      result.tokens.map((t) => ({
        text: line.slice(t.startIndex, t.endIndex),
        scopes: t.scopes,
      })),
    );
    stack = result.ruleStack;
  }
  return { lines: out, balanced: stack.depth <= 1 };
}

/** The tokens of the first line of `text`, as a flat list. */
async function tokenizeLine(text, scopeName) {
  return (await tokenize(text, scopeName)).lines[0];
}

/** The innermost scope of the first token whose text is `word` (ignoring spaces around it). */
function scopeOf(tokens, word) {
  const token = tokens.find((t) => t.text === word) || tokens.find((t) => t.text.trim() === word);
  if (!token) throw new Error(`no token ${JSON.stringify(word)} in ${JSON.stringify(tokens.map((t) => t.text))}`);
  return token.scopes[token.scopes.length - 1];
}

module.exports = { tokenize, tokenizeLine, scopeOf };
