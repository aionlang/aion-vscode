'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, tokenizeLine, scopeOf } = require('./helpers/tokenize');

async function scope(code, word) {
  return scopeOf(await tokenizeLine(code), word);
}

test('comments', async () => {
  const line = await tokenizeLine('// note');
  assert.ok(line.every((t) => t.scopes.includes('comment.line.double-slash.aion')));
  assert.equal(await scope('/* a */ x', ' a '), 'comment.block.aion');
  assert.equal(await scope('/** doc */', ' doc '), 'comment.block.documentation.aion');
});

test('block comments nest', async () => {
  const { lines, balanced } = await tokenize('/* outer /* inner */ still outer */ x := 1');
  assert.ok(balanced);
  const tokens = lines[0];
  assert.equal(scopeOf(tokens, ' inner '), 'comment.block.aion');
  assert.equal(scopeOf(tokens, ' still outer '), 'comment.block.aion');
  assert.equal(scopeOf(tokens, ' x '), 'source.aion');
  assert.equal(scopeOf(tokens, '1'), 'constant.numeric.integer.aion');
});

test('shebang is only recognised on the first line', async () => {
  const { lines } = await tokenize('#!/usr/bin/env aion\nprintln(1)');
  assert.equal(lines[0][0].scopes.at(-1), 'comment.line.shebang.aion');
});

test('keywords', async () => {
  const tokens = await tokenizeLine('if x { return } else { break }');
  for (const word of ['if', 'return', 'else', 'break']) {
    assert.equal(scopeOf(tokens, word), 'keyword.control.aion', word);
  }
});

test('declarations name what they declare', async () => {
  let tokens = await tokenizeLine('fn add(a: Int, b: Int) -> Int {');
  assert.equal(scopeOf(tokens, 'fn'), 'storage.type.function.aion');
  assert.equal(scopeOf(tokens, 'add'), 'entity.name.function.aion');
  assert.equal(scopeOf(tokens, 'a'), 'variable.parameter.aion');
  assert.equal(scopeOf(tokens, 'Int'), 'support.type.builtin.aion');

  tokens = await tokenizeLine('open type Dog(name: String) : Animal(name) {');
  assert.equal(scopeOf(tokens, 'open'), 'storage.modifier.aion');
  assert.equal(scopeOf(tokens, 'type'), 'storage.type.class.aion');
  assert.equal(scopeOf(tokens, 'Dog'), 'entity.name.type.class.aion');
  assert.equal(scopeOf(tokens, 'Animal'), 'entity.name.type.aion');

  tokens = await tokenizeLine('interface Shape {');
  assert.equal(scopeOf(tokens, 'Shape'), 'entity.name.type.class.aion');

  tokens = await tokenizeLine('enum Light {');
  assert.equal(scopeOf(tokens, 'enum'), 'storage.type.class.aion');
});

test('a method added to a type names both the type and the method', async () => {
  const tokens = await tokenizeLine('fn Box<T>.twice() = 2');
  assert.equal(scopeOf(tokens, 'Box'), 'entity.name.type.aion');
  assert.equal(scopeOf(tokens, 'twice'), 'entity.name.function.aion');
  assert.equal(scopeOf(await tokenizeLine('static fn Point.unit() = Point(1, 1)'), 'static'), 'storage.modifier.aion');
});

test('a one-line function ends its header at the equals sign', async () => {
  const tokens = await tokenizeLine('fn double(x: Int) = x * 2');
  assert.equal(scopeOf(tokens, '2'), 'constant.numeric.integer.aion');
  assert.equal(scopeOf(tokens, 'x'), 'variable.parameter.aion');
  assert.ok(!tokens.at(-1).scopes.includes('meta.function.aion'));
});

test('a parameter list may span lines', async () => {
  const { lines, balanced } = await tokenize('fn f(\n    a: Int,\n    b: Int = 1\n) = a + b');
  assert.ok(balanced);
  assert.equal(scopeOf(lines[1], 'a'), 'variable.parameter.aion');
  assert.equal(scopeOf(lines[2], 'b'), 'variable.parameter.aion');
});

test('contextual words are plain names unless they act as keywords', async () => {
  for (const code of ['open := 1', 'data = 2', 'step := 3', 'val := 4', 'init := 5', 'static = 6']) {
    const tokens = await tokenizeLine(code);
    const name = code.split(' ')[0];
    assert.ok(
      !/keyword|storage/.test(scopeOf(tokens, name)),
      `${name} in ${code}: ${JSON.stringify(tokens)}`,
    );
  }
  assert.equal(await scope('val limit = 10', 'val'), 'storage.type.val.aion');
  assert.equal(await scope('for i in 0..20 step 5 {', 'step'), 'keyword.operator.range.aion');
  assert.equal(await scope('x := y as Byte', 'as'), 'keyword.operator.type.aion');
  assert.equal(await scope('x := y as? Byte', 'as?'), 'keyword.operator.type.aion');
  assert.equal(await scope('if a !is Dog {', '!is'), 'keyword.operator.type.aion');
});

test('members named like keywords are properties', async () => {
  const tokens = await tokenizeLine('x.type + x.data.size()');
  assert.equal(scopeOf(tokens, 'type'), 'variable.other.property.aion');
  assert.equal(scopeOf(tokens, 'data'), 'variable.other.property.aion');
  assert.equal(scopeOf(tokens, 'size'), 'entity.name.function.member.aion');
});

test('ranges are not member access', async () => {
  const tokens = await tokenizeLine('for k in 0..names.size() {');
  assert.equal(scopeOf(tokens, '..'), 'keyword.operator.range.aion');
  assert.equal(scopeOf(tokens, 'names'), 'source.aion');
  assert.equal(scopeOf(tokens, 'size'), 'entity.name.function.member.aion');
  assert.equal(scopeOf(await tokenizeLine('1..=5'), '..='), 'keyword.operator.range.aion');
});

test('numbers', async () => {
  const cases = {
    '42': 'constant.numeric.integer.aion',
    '1_000_000': 'constant.numeric.integer.aion',
    '0xFF': 'constant.numeric.hex.aion',
    '0b1010': 'constant.numeric.binary.aion',
    '0o17': 'constant.numeric.octal.aion',
    '1.5': 'constant.numeric.float.aion',
    '1.5e-3': 'constant.numeric.float.aion',
    '1e9': 'constant.numeric.float.aion',
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(await scope(`x := ${text}`, text), expected, text);
  }
});

test('a number followed by a method is an integer, not a float', async () => {
  const tokens = await tokenizeLine('100.toChar()');
  assert.equal(scopeOf(tokens, '100'), 'constant.numeric.integer.aion');
  assert.equal(scopeOf(tokens, 'toChar'), 'entity.name.function.member.aion');
});

test('strings', async () => {
  const tokens = await tokenizeLine('"Hello, $name! ${n + 1} \\n \\$ \\u{1F600}"');
  assert.equal(scopeOf(tokens, 'name'), 'variable.other.interpolated.aion');
  assert.equal(scopeOf(tokens, '\\n'), 'constant.character.escape.aion');
  assert.equal(scopeOf(tokens, '\\$'), 'constant.character.escape.aion');
  assert.equal(scopeOf(tokens, '\\u{1F600}'), 'constant.character.escape.aion');
  assert.equal(scopeOf(tokens, '1'), 'constant.numeric.integer.aion');
});

test('a bad escape is flagged', async () => {
  assert.equal(await scope('"a\\qb"', '\\q'), 'invalid.illegal.unknown-escape.aion');
});

test('a dollar sign that names nothing is plain text', async () => {
  const tokens = await tokenizeLine('"cost: $5 and $"');
  assert.ok(tokens.every((t) => !t.scopes.some((s) => s.includes('interpolation'))));
});

test('interpolation holds nested strings and braces', async () => {
  const { lines, balanced } = await tokenize('x := "a ${xs.map { "<${it}>" }.join()} b"');
  assert.ok(balanced);
  const tokens = lines[0];
  assert.equal(scopeOf(tokens, 'it'), 'variable.language.it.aion');
  assert.equal(scopeOf(tokens, 'join'), 'entity.name.function.member.aion');
  assert.equal(tokens.at(-2).scopes.at(-1), 'string.quoted.double.aion');
});

test('a format spec in an interpolation is told from the colon of a conditional', async () => {
  const tokens = await tokenizeLine('"${price:>8.2f} ${ok ? "y" : "n"} ${n:,}"');
  assert.equal(scopeOf(tokens, ':'), 'punctuation.separator.format-spec.aion');
  assert.equal(scopeOf(tokens, '>8.2f'), 'constant.other.format-spec.aion');
  assert.equal(scopeOf(tokens, ','), 'constant.other.format-spec.aion');
  assert.equal(tokens.filter((t) => t.scopes.includes('constant.other.format-spec.aion')).length, 2);
  assert.equal(scopeOf(tokens, 'price'), 'source.aion');
});

test('triple-quoted strings span lines and hold quotes', async () => {
  const { lines, balanced } = await tokenize('s := """He said "hi" to $name\nand left"""\nx := 1');
  assert.ok(balanced);
  assert.equal(scopeOf(lines[0], 'name'), 'variable.other.interpolated.aion');
  assert.ok(lines[1][0].scopes.includes('string.quoted.triple.aion'));
  assert.equal(scopeOf(lines[2], 'x'), 'source.aion');
});

test('raw strings have no escapes or interpolation', async () => {
  const tokens = await tokenizeLine('p := r"C:\\dir\\$HOME"');
  assert.ok(tokens.filter((t) => t.text.includes('dir')).every((t) => t.scopes.at(-1) === 'string.quoted.other.raw.aion'));
  assert.ok(!tokens.some((t) => t.scopes.some((s) => s.includes('escape') || s.includes('interpolation'))));
});

test('characters', async () => {
  assert.equal(await scope("c := 'a'", "'a'"), 'string.quoted.single.char.aion');
  const tokens = await tokenizeLine("c := '\\n'");
  assert.ok(tokens.some((t) => t.text === '\\n' && t.scopes.at(-1) === 'constant.character.escape.aion'));
  assert.equal(await scope("c := '\\u{1F600}'", "'\\u{1F600}'").catch(() => 'split'), 'split');
});

test('constants and operators', async () => {
  const tokens = await tokenizeLine('a := b ?: null; c = d?.e!!; ok = !x && y');
  assert.equal(scopeOf(tokens, ':='), 'keyword.operator.declaration.aion');
  assert.equal(scopeOf(tokens, '?:'), 'keyword.operator.elvis.aion');
  assert.equal(scopeOf(tokens, 'null'), 'constant.language.null.aion');
  assert.equal(scopeOf(tokens, '!!'), 'keyword.operator.null-assert.aion');
  assert.equal(scopeOf(tokens, '&&'), 'keyword.operator.logical.aion');
  assert.equal(scopeOf(await tokenizeLine('f(true, false)'), 'true'), 'constant.language.boolean.aion');
});

test('lambdas and function types', async () => {
  const tokens = await tokenizeLine('fn apply(f: (Int) -> Int, x: Int) = f(x)');
  assert.equal(scopeOf(tokens, 'f'), 'variable.parameter.aion');
  assert.equal(scopeOf(tokens, '->'), 'keyword.operator.arrow.aion');
  assert.equal(scopeOf(await tokenizeLine('xs.fold(0) { acc, x -> acc + x }'), 'fold'), 'entity.name.function.member.aion');
});

test('imports', async () => {
  let tokens = await tokenizeLine('import utils as u');
  assert.equal(scopeOf(tokens, 'import'), 'keyword.control.import.aion');
  assert.equal(scopeOf(tokens, 'utils'), 'entity.name.namespace.aion');
  assert.equal(scopeOf(tokens, 'as'), 'keyword.control.import.aion');
  tokens = await tokenizeLine('from sockets import TcpListener, TcpStream');
  assert.equal(scopeOf(tokens, 'sockets'), 'entity.name.namespace.aion');
  assert.equal(scopeOf(tokens, 'TcpStream'), 'entity.name.type.aion');
  assert.equal(scopeOf(await tokenizeLine('import @util'), '@util'), 'entity.name.namespace.aion');
  assert.equal(scopeOf(await tokenizeLine('import ..shared.util'), '..shared.util'), 'entity.name.namespace.aion');
});

test('builtins', async () => {
  assert.equal(await scope('println(1)', 'println'), 'support.function.builtin.aion');
  assert.equal(await scope('launch { yield() }', 'launch'), 'support.function.builtin.aion');
  // a variable that happens to be called max is not the builtin
  assert.equal(await scope('max = 3', 'max'), 'source.aion');
  assert.equal(await scope('max(1, 2)', 'max'), 'support.function.builtin.aion');
});

test('calls, constructors and constants', async () => {
  assert.equal(await scope('greet("Ann")', 'greet'), 'entity.name.function.call.aion');
  assert.equal(await scope('identity<Float>(2)', 'identity'), 'entity.name.function.call.aion');
  assert.equal(await scope('p := Point(1, 2)', 'Point'), 'entity.name.type.aion');
  assert.equal(await scope('x := MAX_SIZE', 'MAX_SIZE'), 'variable.other.constant.aion');
});

test('this, super and it', async () => {
  assert.equal(await scope('super.sound()', 'super'), 'variable.language.this.aion');
  assert.equal(await scope('{ it + 1 }', 'it'), 'variable.language.it.aion');
});

test('a doc comment before a declaration does not leak', async () => {
  const { lines, balanced } = await tokenize('/**\n * The light.\n */\nenum Light {\n    Red, Green\n}');
  assert.ok(balanced);
  assert.ok(lines[1].every((t) => t.scopes.includes('comment.block.documentation.aion')));
  assert.equal(scopeOf(lines[3], 'Light'), 'entity.name.type.class.aion');
});

test('a run of quotes at the end of a triple-quoted string closes it', async () => {
  const { lines, balanced } = await tokenize('a := """"quoted""""\nb := """""".length()\nc := r"""x"""');
  assert.ok(balanced);
  assert.equal(scopeOf(lines[0], 'a'), 'source.aion');
  assert.equal(scopeOf(lines[1], 'length'), 'entity.name.function.member.aion');
  assert.equal(scopeOf(lines[2], 'c'), 'source.aion');
});
