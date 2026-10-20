'use strict';

const path = require('path');
const { mask, scan } = require('./symbols');

const isWord = (c) => c !== undefined && /\w/.test(c);

/** The scanned files, kept until their text changes. */
class SymbolIndex {
  /** @param {(file: string) => string | undefined} read  the text of a file: open in the editor, or on disk */
  constructor(read) {
    this.read = read;
    this.entries = new Map();
  }

  /** @param {string} [text]  the text of `file` when the caller already holds it */
  get(file, text = this.read(file)) {
    if (text === undefined) return undefined;
    const known = this.entries.get(file);
    if (known && known.text === text) return known;
    const entry = { file, text, ...scan(text) };
    this.entries.set(file, entry);
    return entry;
  }
}

/** The folder of the `aion.project` above `file`, else `fallback`, else the file's own folder. */
function projectRoot(file, exists, fallback) {
  let dir = path.dirname(file);
  for (;;) {
    if (exists(path.join(dir, 'aion.project'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return fallback ?? path.dirname(file);
    dir = parent;
  }
}

/** The file a module path stands for, as `import` looks for it; the standard library is not on disk. */
function moduleFile(imp, names, from, { exists, root }) {
  if (names.length === 0) return undefined;
  const here = path.dirname(from);
  let dirs;
  if (imp.base === 'root') dirs = [root];
  else if (imp.base === 'relative') dirs = [path.resolve(here, ...Array(imp.up).fill('..'))];
  else dirs = [here, path.join(here, 'lib'), root, path.join(root, 'lib')];
  for (const dir of dirs) {
    const stem = path.join(dir, ...names);
    for (const candidate of [`${stem}.aion`, path.join(stem, 'lib.aion'), path.join(stem, `${names.at(-1)}.aion`)]) {
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * What the imports of a file bring in: modules under the name used for them, and names taken out of a
 * module (`from m import a`, or `import m.a`).
 */
function bindings(here, ctx) {
  const found = [];
  for (const imp of here.imports) {
    const names = imp.path.map((s) => s.name);
    let file = moduleFile(imp, names, here.file, ctx);
    let taken = [];
    let moduleNames = names;
    if (file && imp.from) taken = imp.names.map((n) => n.name);
    else if (!file && names.length > 1) {
      moduleNames = names.slice(0, -1);
      file = moduleFile(imp, moduleNames, here.file, ctx);
      taken = [names.at(-1)];
    }
    const entry = file && ctx.index.get(file);
    if (!entry) continue;
    found.push({ name: imp.from ? undefined : imp.alias?.name ?? moduleNames.at(-1), entry, taken });
  }
  return found;
}

const topLevel = (entry, word) => (entry ? entry.declarations.filter((d) => d.scope === 'top' && d.name === word).map((d) => place(entry, d)) : []);
const place = (entry, d) => ({ file: entry.file, line: d.line, character: d.character, length: d.name.length });

/** `name` and the types it inherits from, nearest first, as far as the given files tell. */
function lineage(entries, name) {
  const order = [name];
  for (let i = 0; i < order.length; i++) {
    for (const entry of entries) {
      for (const parent of entry.parents.get(order[i]) ?? []) if (!order.includes(parent)) order.push(parent);
    }
  }
  return order;
}

/** The members among `found` of the first of `owners` that has any. */
function firstOwner(found, owners) {
  for (const owner of owners) {
    const hit = found.filter(({ d }) => d.owner === owner);
    if (hit.length > 0) return hit;
  }
  return [];
}

/** The name before the `.` that `start` follows (empty for a call or an index), or undefined without a `.`. */
function qualifierOf(text, start) {
  let i = start;
  while (text[i - 1] === ' ' || text[i - 1] === '\t') i--;
  if (text[i - 1] !== '.' || text[i - 2] === '.') return undefined;
  i--;
  while (' \t?!'.includes(text[i - 1] ?? 'x')) i--;
  let from = i;
  while (isWord(text[from - 1])) from--;
  return text.slice(from, i);
}

function importTarget(imp, start, here, ctx) {
  const names = imp.path.map((s) => s.name);
  const segment = imp.path.findIndex((s) => s.offset === start);
  if (segment >= 0) {
    const file = moduleFile(imp, names.slice(0, segment + 1), here.file, ctx);
    if (file) return [{ file, line: 0, character: 0, length: 0 }];
    // `import sockets.TcpListener`: the last name may live inside the module before it
    if (segment > 0 && segment === names.length - 1) {
      const module = moduleFile(imp, names.slice(0, -1), here.file, ctx);
      return topLevel(module && ctx.index.get(module), names[segment]);
    }
    return [];
  }
  const file = moduleFile(imp, names, here.file, ctx);
  if (!file) return [];
  if (imp.alias?.offset === start) return [{ file, line: 0, character: 0, length: 0 }];
  const named = imp.names?.find((n) => n.offset === start);
  return named ? topLevel(ctx.index.get(file), named.name) : [];
}

/** Whether the word at `start` sits in a comment. */
const inComment = (text, start) => mask(text, true)[start] === ' ';

/**
 * Where the name under the cursor is declared: `[{ file, line, character, length }]`, empty when nothing
 * is known.  It looks at what is written, not at types, so `x.area()` finds every `area` of a type.
 *
 * @param {object} request
 * @param {string} request.file  the file the cursor is in
 * @param {string} request.text  its text
 * @param {SymbolIndex} request.index
 * @param {(file: string) => boolean} request.exists
 * @param {string} request.root  the project folder
 */
function findDefinitions({ file, text, line, character, index, exists, root }) {
  const here = index.get(file, text);
  const offset = here.offsetAt(line, character);
  if (offset < 0) return [];
  let start = offset;
  while (start > 0 && isWord(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && isWord(text[end])) end++;
  const word = text.slice(start, end);
  if (!word || /^\d/.test(word) || inComment(text, start)) return [];

  const ctx = { index, exists, root };
  const imp = here.imports.find((i) => start >= i.start && start <= i.end);
  if (imp) return importTarget(imp, start, here, ctx);

  const imported = bindings(here, ctx);
  const entries = [here, ...imported.map((b) => b.entry)];
  const enclosing = here.scopes.filter((s) => s.open <= offset && offset <= s.close).map((s) => s.owner);
  const inherited = enclosing.flatMap((owner) => lineage(entries, owner));
  const membersNamed = (name) =>
    entries.flatMap((entry) => entry.declarations.filter((d) => d.scope === 'member' && d.name === name).map((d) => ({ entry, d })));

  const qualifier = qualifierOf(text, start);
  if (qualifier !== undefined) {
    const module = qualifier && imported.find((b) => b.name === qualifier);
    if (module) return topLevel(module.entry, word);
    const members = membersNamed(word);
    let owners = [];
    if (qualifier === 'this') owners = inherited;
    else if (qualifier === 'super') owners = enclosing.flatMap((owner) => lineage(entries, owner).slice(1));
    else if (/^[A-Z]/.test(qualifier)) owners = lineage(entries, qualifier);
    const preferred = firstOwner(members, owners);
    return (preferred.length > 0 ? preferred : members).map(({ entry, d }) => place(entry, d));
  }

  const locals = here.declarations.filter((d) => d.scope === 'local' && d.name === word && d.offset <= offset && offset <= d.until);
  if (locals.length > 0) return [place(here, locals.reduce((a, b) => (b.offset > a.offset ? b : a)))];

  const own = firstOwner(membersNamed(word), inherited);
  if (own.length > 0) return own.map(({ entry, d }) => place(entry, d));

  const top = topLevel(here, word);
  if (top.length > 0) return top;
  return imported.filter((b) => b.taken.includes(word)).flatMap((b) => topLevel(b.entry, word));
}

module.exports = { SymbolIndex, findDefinitions, projectRoot };
