'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mask, scan } = require('../src/symbols');

/** The declarations of `text` as `kind name` (`@owner`, `scope`), to compare against a short list. */
const declared = (text) =>
  scan(text).declarations.map((d) => `${d.kind} ${d.name}${d.owner ? `@${d.owner}` : ''} ${d.scope}`);

test('masking keeps the length and the lines', () => {
  const text = 'a := 1 // note\nb := "x // y" /* z\nw */ c := \'"\'\n';
  const masked = mask(text);
  assert.equal(masked.length, text.length);
  assert.deepEqual(masked.split('\n').map((l) => l.length), text.split('\n').map((l) => l.length));
  assert.equal(masked, 'a := 1        \nb :=              \n     c :=    \n');
});

test('block comments nest and strings may hold comment markers', () => {
  assert.equal(mask('/* a /* b */ c */ x').trim(), 'x');
  assert.equal(mask('"http://x" y').trim(), 'y');
  assert.equal(mask('"http://x" y', true), '"http://x" y');
});

test('a string with a string inside its interpolation ends where it should', () => {
  const masked = mask('s := "a ${xs.join(", ")} b" t := 1');
  assert.match(masked, /^s := +t := 1$/);
  assert.equal(mask('"""say "hi"""" q').trim(), 'q');
  assert.equal(mask('r"C:\\dir" z').trim(), 'z');
});

test('functions, types and what they hold', () => {
  const found = declared(`
type Token(kind: String, text: String)
open type Node {
    open fn eval(vars: Map<String, Float>) -> Float = 0.0
    count: Int = 0
}
type Number(value: Float) : Node() {
    override fn eval(vars: Map<String, Float>) = value
}
fn tokenize(source: String) -> List<Token> {
    tokens := List<Token>()
    for c in source {
        n := 1
    }
}
fn Number.double() = value * 2
interface Shape {
    fn area() -> Float
}
synonym Names = List<String>
limit := 10
val max = 3
`);
  const names = new Set(found);
  for (const wanted of [
    'type Token top',
    'field kind@Token member',
    'method eval@Node member',
    'field count@Node member',
    'method eval@Number member',
    'function tokenize top',
    'parameter source local',
    'method double@Number member',
    'interface Shape top',
    'method area@Shape member',
    'alias Names top',
    'variable limit top',
    'variable max top',
    'variable tokens local',
    'variable c local',
    'variable n local',
  ]) {
    assert.ok(names.has(wanted), `missing: ${wanted}`);
  }
});

test('enum variants belong to their enum', () => {
  const found = declared('enum Color { Red, Green, Blue(3) }\nenum Planet(mass: Float) {\n    Earth(5.97),\n    Mars(0.64)\n}');
  for (const wanted of ['enum Color top', 'variant Red@Color member', 'variant Blue@Color member', 'variant Earth@Planet member', 'variant Mars@Planet member', 'field mass@Planet member']) {
    assert.ok(found.includes(wanted), `missing: ${wanted}`);
  }
});

test('a local holds until the end of the block it is in', () => {
  const text = 'fn a() {\n    if true {\n        inner := 1\n    }\n    outer := 2\n}\nfn b(p: Int) = p\n';
  const { declarations, offsetAt } = scan(text);
  const by = (name) => declarations.find((d) => d.name === name);
  assert.equal(by('inner').until, text.indexOf('}'));
  assert.equal(by('outer').until, text.lastIndexOf('}'));
  assert.equal(by('p').until, offsetAt(6, 0) + 'fn b(p: Int) = p'.length);
});

test('loop variables, catch names and lambda parameters are locals', () => {
  const found = declared('fn f() {\n    for i, name in xs { }\n    try { } catch e { }\n    ys.map { a, b -> a }\n    ys.map { x: Int -> x }\n}\n');
  for (const wanted of ['variable i local', 'variable name local', 'variable e local', 'parameter a local', 'parameter b local', 'parameter x local']) {
    assert.ok(found.includes(wanted), `missing: ${wanted}`);
  }
});

test('nothing is declared in a comment or a string', () => {
  assert.deepEqual(declared('// fn hidden()\n/* type Hidden */\ns := "fn shown()"\n'), ['variable s top']);
});

test('imports keep where each part of the path is', () => {
  const text = 'import utils as u\nimport ..shared.util\nimport @core\nfrom sockets import TcpListener, TcpStream\n';
  const { imports } = scan(text);
  assert.deepEqual(imports.map((i) => [i.base, i.up, i.path.map((s) => s.name), i.from]), [
    ['bare', 0, ['utils'], false],
    ['relative', 1, ['shared', 'util'], false],
    ['root', 0, ['core'], false],
    ['bare', 0, ['sockets'], true],
  ]);
  assert.equal(imports[0].alias.name, 'u');
  assert.equal(text.slice(imports[1].path[1].offset, imports[1].path[1].offset + 4), 'util');
  assert.deepEqual(imports[3].names.map((n) => n.name), ['TcpListener', 'TcpStream']);
  assert.equal(text.slice(imports[3].names[1].offset).slice(0, 9), 'TcpStream');
});

test('the parents of a type are the names after its colon', () => {
  const { parents } = scan('type A(x: Int) : B(x), C {\n}\ntype D(y: Int)\n');
  assert.deepEqual(parents.get('A'), ['B', 'C']);
  assert.deepEqual(parents.get('D'), []);
});
