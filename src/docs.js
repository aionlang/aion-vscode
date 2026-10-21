'use strict';

// Links to the Aion documentation.  Plain data and lookups, so the tests can run them without VS Code.

const SITE = 'https://aionlang.github.io/documentation';
const REPO_DOCS = 'https://github.com/aionlang/aion/blob/main/docs';

/** The pages offered by "Open Aion Documentation". */
const PAGES = [
  { label: 'Getting started', detail: 'Install Aion and run a first program', url: `${SITE}/getting-started` },
  { label: 'Syntax', detail: 'Variables, control flow, strings, operators', url: `${SITE}/syntax` },
  { label: 'Types', detail: 'Types, data types, enums, generics, interfaces, nullability', url: `${SITE}/types` },
  { label: 'Functions', detail: 'Parameters, defaults, varargs, lambdas, closures', url: `${SITE}/functions` },
  { label: 'Prelude methods', detail: 'Methods of List, Map, Set, String and the other built-in types', url: `${SITE}/prelude-methods` },
  { label: 'Standard library', detail: 'math, fs, json, http, regex, sqlite and the other modules', url: `${SITE}/stdlib` },
  { label: 'Errors and concurrency', detail: 'panic, try, defer, tasks, channels, threads', url: `${SITE}/errors-and-concurrency` },
  { label: 'Packages and C bindings', detail: 'Projects, dependencies, extern fn', url: `${SITE}/packages-and-ffi` },
  { label: 'Language reference (in the repository)', detail: 'docs/language.md', url: `${REPO_DOCS}/language.md` },
  { label: 'Projects and dependencies (in the repository)', detail: 'docs/projects.md', url: `${REPO_DOCS}/projects.md` },
];

const page = (name) => `${SITE}/${name}`;

/** Word → documentation page.  The first table that lists a word wins. */
const TOPICS = [
  [page('errors-and-concurrency'), 'panic try catch defer launch async await Channel select sleep yield Thread Mutex AtomicInt Job Task waitAll'],
  [page('functions'), 'fn vararg lambda closure return extern'],
  [page('types'), 'type data open override interface enum syn val Int Float Bool Char Bytes Byte Int32 Any Result Tuple2 Tuple3 Range'],
  [page('syntax'), 'if else when while for in break continue import from as is'],
  [page('prelude-methods'), 'List Map Set Entry StringBuilder String Stream listOf setOf mapOf println print'],
  [page('stdlib'), 'math fs path os time random json csv regex http http2 net sockets sqlite zlib hash crypto encoding cli term test log archive xml bigint unicode websocket smtp reflect'],
];

const BY_WORD = new Map();
for (const [url, words] of TOPICS) {
  for (const word of words.split(' ')) if (!BY_WORD.has(word)) BY_WORD.set(word, url);
}

/** The page that explains `word` (a keyword, type or module name), or undefined. */
function pageFor(word) {
  return BY_WORD.get(word);
}

module.exports = { SITE, PAGES, pageFor };
