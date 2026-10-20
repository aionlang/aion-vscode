'use strict';

// What an Aion file declares and imports, found without compiling it; "go to definition" is built on this.
// The text is read the way syntaxes/aion.tmLanguage.json reads it, so an odd corner of the language can be
// missed.  The answer is then no definition rather than a wrong one.

const MODIFIERS = '(?:(?:open|data|override|static|extern)[ \\t]+)*';
const FN = new RegExp(`^[ \\t]*${MODIFIERS}fn[ \\t]+(?:([A-Z]\\w*)(?:<[^()\\n]*?>)?[ \\t]*\\.[ \\t]*)?(\\w+)`, 'gm');
const TYPE = new RegExp(`^[ \\t]*${MODIFIERS}(type|interface|enum)[ \\t]+(\\w+)`, 'gm');
const ALIAS = /^[ \t]*(?:synonym|syn|typealias)[ \t]+(\w+)/gm;
const VAL = new RegExp(`^[ \\t]*${MODIFIERS}val[ \\t]+(\\w+)`, 'gm');
const LET = /^[ \t]*([A-Za-z_]\w*)[ \t]*(?::[ \t]*[^={\n]+?)?[ \t]*:=(?!=)/gm; // x := 1   x: Int := 1
const TYPED = /^[ \t]*([A-Za-z_]\w*)[ \t]*:[ \t]*[^={\n:]+?[ \t]*=(?![=>])/gm; // at: Int = 0
const FOR = /(\bfor[ \t]+)([A-Za-z_]\w*)(?:([ \t]*,[ \t]*)([A-Za-z_]\w*))?[ \t]+in\b/g;
const CATCH = /(\bcatch[ \t]+)([A-Za-z_]\w*)/g;
const LAMBDA = /\{\s*((?:[A-Za-z_]\w*(?:\s*:\s*[^,{}>-]+?)?\s*,\s*)*[A-Za-z_]\w*(?:\s*:\s*[^,{}>-]+?)?)\s*->/g;
const IMPORT = /^[ \t]*import[ \t]+(\.*|@)([\w.]*\w)(?:[ \t]+as[ \t]+(\w+))?/gm;
const FROM = /^[ \t]*from[ \t]+(\.*|@)([\w.]*\w)[ \t]+import[ \t]+([^\n]+)/gm;
const VARIANT = /\s*([A-Z]\w*)\s*(?:\([^()]*(?:\([^()]*\)[^()]*)*\))?\s*(?:,|(?=[;}]))/y;
const CHAR = /'(?:[^'\\\n]|\\[^\n]|\\u\{[0-9a-fA-F]{1,6}\})'/y;

const isWord = (c) => c !== undefined && /\w/.test(c);
const isBlank = (c) => c === ' ' || c === '\t';

/**
 * `text` with comments blanked out, and strings too unless `keepStrings`: same length, same lines, so an
 * offset in one is the same place in the other.
 */
function mask(text, keepStrings = false) {
  const out = text.split('');
  const n = text.length;
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
  };

  // where the character literal at `i` ends, or `i` if there is none
  const charEnd = (i) => {
    CHAR.lastIndex = i;
    return CHAR.test(text) ? CHAR.lastIndex : i;
  };

  // where the `${ … }` whose contents start at `i` ends; it may hold strings of its own
  const interpolationEnd = (i) => {
    let depth = 1;
    let j = i;
    while (j < n) {
      const c = text[j];
      if (c === '"' || (c === 'r' && text[j + 1] === '"' && !isWord(text[j - 1]))) j = stringEnd(j);
      else if (c === "'" && charEnd(j) > j) j = charEnd(j);
      else if (c === '{') {
        depth++;
        j++;
      } else if (c === '}' && --depth === 0) return j + 1;
      else j++;
    }
    return n;
  };

  // where the string starting at `i` (its `"`, or the `r` of a raw one) ends
  const stringEnd = (i) => {
    const raw = text[i] === 'r';
    let j = raw ? i + 1 : i;
    const triple = text.startsWith('"""', j);
    j += triple ? 3 : 1;
    while (j < n) {
      const c = text[j];
      if (!raw && c === '\\') j += 2;
      else if (!raw && c === '$' && text[j + 1] === '{') j = interpolationEnd(j + 2);
      else if (triple && text.startsWith('"""', j)) {
        while (text[j] === '"') j++; // a run of quotes at the end closes the string
        return j;
      } else if (!triple && c === '"') return j + 1;
      else if (!triple && c === '\n') return j; // never closed
      else j++;
    }
    return n;
  };

  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && text[i + 1] === '*') {
      let depth = 1; // block comments nest
      let j = i + 2;
      while (j < n && depth > 0) {
        if (text.startsWith('/*', j)) {
          depth++;
          j += 2;
        } else if (text.startsWith('*/', j)) {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j);
      i = j;
    } else if (c === '"' || (c === 'r' && text[i + 1] === '"' && !isWord(text[i - 1]))) {
      const end = stringEnd(i);
      if (!keepStrings) blank(i, end);
      i = end;
    } else if (c === "'" && charEnd(i) > i) {
      const end = charEnd(i);
      if (!keepStrings) blank(i, end);
      i = end;
    } else i++;
  }
  return out.join('');
}

const lineStarts = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
};

function positionAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low, character: offset - starts[low] };
}

/** Index after the `>` that closes the `<` at `i`, or `i` when the line does not close it. */
function skipAngles(code, i) {
  let depth = 0;
  for (let j = i; j < code.length && code[j] !== '\n'; j++) {
    if (code[j] === '<') depth++;
    else if (code[j] === '>' && code[j - 1] !== '-' && --depth === 0) return j + 1;
  }
  return i;
}

/** Index of the `)` that closes the `(` at `open`. */
function closing(code, open) {
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === '(') depth++;
    else if (code[j] === ')' && --depth === 0) return j;
  }
  return code.length;
}

/** The names of a parameter list, with where each one starts; `from` and `to` are inside the parentheses. */
function parameters(code, from, to) {
  const found = [];
  let depth = 0;
  let begin = from;
  const take = (end) => {
    const m = /^(\s*(?:(?:val|var)\s+)?)([A-Za-z_]\w*)\s*:/.exec(code.slice(begin, end));
    if (m) found.push({ name: m[2], offset: begin + m[1].length });
  };
  for (let j = from; j < to; j++) {
    const c = code[j];
    if ('([{<'.includes(c)) depth++;
    else if (')]}'.includes(c) || (c === '>' && code[j - 1] !== '-')) depth--;
    else if (c === ',' && depth === 0) {
      take(j);
      begin = j + 1;
    }
  }
  take(to);
  return found;
}

/**
 * Everything `text` declares and imports.
 *
 * A declaration is `{ kind, name, offset, line, character, scope, owner?, until? }`.  Its `scope` is `top`
 * (at file level), `member` (of the type named by `owner`) or `local`, which holds from its `offset` to
 * `until`.  The kinds are function, method, type, interface, enum, variant, alias, variable, field and
 * parameter.
 */
function scan(text) {
  const code = mask(text);
  const starts = lineStarts(text);
  const lineEnd = (offset) => {
    const end = code.indexOf('\n', offset);
    return end < 0 ? code.length : end;
  };

  const declarations = [];
  const imports = [];
  const scopes = []; // the bodies of types and of methods written outside their type
  const parents = new Map(); // type -> the names after its `:`
  const bodies = new Map(); // offset of a `{` -> what it opens
  const spans = []; // parameter lists, which hold no statements

  const add = (kind, name, offset, extra) => {
    declarations.push({ kind, name, offset, ...extra });
  };
  const nameOffset = (m, name) => m.index + m[0].length - name.length;
  const braceOnLine = (from) => {
    const brace = code.indexOf('{', from);
    return brace >= 0 && brace < lineEnd(from) ? brace : -1;
  };

  // The generics and parameters after a name that ends at `from`; gives where the head ends.
  const head = (from, onParameter) => {
    let p = from;
    while (isBlank(code[p])) p++;
    if (code[p] === '<') p = skipAngles(code, p);
    while (isBlank(code[p])) p++;
    if (code[p] !== '(') return p;
    const close = closing(code, p);
    spans.push([p, close]);
    for (const parameter of parameters(code, p + 1, close)) onParameter(parameter);
    return close + 1;
  };

  // The `{` that opens the body of a declaration whose head ends at `from`, or -1 for a body-less one
  // (`type Token(kind: String)`, `fn show() = name`).
  const bodyBrace = (from) => {
    const end = lineEnd(from);
    const rest = code.slice(from, end);
    const brace = rest.indexOf('{');
    const equals = rest.search(/(?<![=!<>:-])=(?![=>])/);
    if (brace >= 0) return equals >= 0 && equals < brace ? -1 : from + brace;
    if (equals >= 0) return -1;
    const next = /^\s*\{/.exec(code.slice(end, end + 200));
    return next ? end + next[0].length - 1 : -1;
  };

  for (const m of code.matchAll(FN)) {
    const [, owner, name] = m;
    add(owner ? 'method' : 'function', name, nameOffset(m, name), owner ? { owner, scope: 'member' } : {});
    const params = [];
    const end = head(m.index + m[0].length, (p) => params.push(p));
    const brace = bodyBrace(end);
    if (brace >= 0) bodies.set(brace, owner ? { kind: 'fn', owner } : { kind: 'fn' });
    for (const p of params) {
      add('parameter', p.name, p.offset, { scope: 'local', scopeBrace: brace, lineEnd: lineEnd(end) });
    }
  }

  for (const m of code.matchAll(TYPE)) {
    const [, keyword, name] = m;
    add(keyword, name, nameOffset(m, name));
    const end = head(m.index + m[0].length, (p) => add('field', p.name, p.offset, { scope: 'member', owner: name }));
    const brace = bodyBrace(end);
    const rest = code.slice(end, brace >= 0 ? brace : lineEnd(end));
    parents.set(name, /^\s*:/.test(rest) ? rest.replace(/\([^()]*\)/g, '').slice(rest.indexOf(':') + 1).match(/[A-Za-z_]\w*/g) ?? [] : []);
    if (brace < 0) continue;
    bodies.set(brace, { kind: 'type', owner: name });
    if (keyword === 'enum') {
      VARIANT.lastIndex = brace + 1;
      for (let v = VARIANT.exec(code); v; v = VARIANT.exec(code)) {
        add('variant', v[1], v.index + v[0].indexOf(v[1]), { scope: 'member', owner: name });
      }
    }
  }

  for (const m of code.matchAll(ALIAS)) add('alias', m[1], nameOffset(m, m[1]));
  for (const m of code.matchAll(VAL)) add('variable', m[1], nameOffset(m, m[1]));
  const insideParameters = (offset) => spans.some(([from, to]) => offset > from && offset < to);
  for (const pattern of [LET, TYPED]) {
    for (const m of code.matchAll(pattern)) {
      const offset = m.index + m[0].indexOf(m[1]);
      if (!insideParameters(offset)) add('variable', m[1], offset);
    }
  }

  const loopVariable = (name, offset, from) => {
    add('variable', name, offset, { scope: 'local', scopeBrace: braceOnLine(from), lineEnd: lineEnd(from) });
  };
  for (const m of code.matchAll(FOR)) {
    const after = m.index + m[0].length;
    loopVariable(m[2], m.index + m[1].length, after);
    if (m[4]) loopVariable(m[4], m.index + m[1].length + m[2].length + m[3].length, after);
  }
  for (const m of code.matchAll(CATCH)) loopVariable(m[2], m.index + m[1].length, m.index + m[0].length);
  for (const m of code.matchAll(LAMBDA)) {
    const first = m.index + m[0].indexOf(m[1]);
    for (const p of m[1].matchAll(/([A-Za-z_]\w*)(?:\s*:\s*[^,]+)?/g)) {
      if (p[1] === 'else') continue;
      add('parameter', p[1], first + p.index, { scope: 'local', scopeBrace: m.index, lineEnd: lineEnd(m.index) });
    }
  }

  for (const regex of [IMPORT, FROM]) {
    for (const m of code.matchAll(regex)) {
      const [, prefix, path] = m;
      const from = regex === FROM;
      const pathStart = m.index + m[0].indexOf(prefix + path) + prefix.length;
      let at = pathStart;
      const segments = path.split('.').map((name) => {
        const segment = { name, offset: at };
        at += name.length + 1;
        return segment;
      });
      const record = {
        base: prefix === '@' ? 'root' : prefix ? 'relative' : 'bare',
        up: prefix.length > 1 ? prefix.length - 1 : 0,
        path: segments,
        from,
        start: m.index,
        end: m.index + m[0].length,
      };
      if (from) {
        const listStart = m.index + m[0].length - m[3].length;
        record.names = [...m[3].matchAll(/[A-Za-z_]\w*/g)].map((n) => ({ name: n[0], offset: listStart + n.index }));
      } else if (m[3]) {
        record.alias = { name: m[3], offset: m.index + m[0].length - m[3].length };
      }
      imports.push(record);
    }
  }

  // Walk the braces to tell what each declaration sits in.
  const stack = [];
  const closed = new Map();
  const pending = [...declarations].sort((a, b) => a.offset - b.offset);
  let next = 0;
  const place = (d) => {
    if (!d.scope) {
      const top = stack[stack.length - 1];
      if (!top) d.scope = 'top';
      else if (top.kind === 'type') {
        d.scope = 'member';
        d.owner = top.owner;
      } else {
        d.scope = 'local';
        d.scopeBrace = top.open;
      }
    }
    if (d.scope === 'member') {
      if (d.kind === 'function') d.kind = 'method';
      if (d.kind === 'variable') d.kind = 'field';
    }
  };
  for (let i = 0; i < code.length; i++) {
    while (next < pending.length && pending[next].offset <= i) place(pending[next++]);
    if (code[i] === '{') stack.push({ open: i, ...(bodies.get(i) ?? { kind: 'block' }) });
    else if (code[i] === '}') {
      const frame = stack.pop();
      if (!frame) continue;
      closed.set(frame.open, i);
      if (frame.owner) scopes.push({ owner: frame.owner, open: frame.open, close: i });
    }
  }
  while (next < pending.length) place(pending[next++]);
  for (const frame of stack) if (frame.owner) scopes.push({ owner: frame.owner, open: frame.open, close: code.length });

  for (const d of declarations) {
    Object.assign(d, positionAt(starts, d.offset));
    if (d.scope !== 'local') continue;
    d.until = d.scopeBrace >= 0 ? closed.get(d.scopeBrace) ?? code.length : d.lineEnd ?? code.length;
  }

  return {
    declarations,
    imports,
    scopes,
    parents,
    /** The offset of a line and column of `text`, or -1 outside it. */
    offsetAt: (line, character) => (line >= 0 && line < starts.length ? starts[line] + character : -1),
  };
}

module.exports = { mask, scan };
