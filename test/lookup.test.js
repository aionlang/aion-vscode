'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SymbolIndex, findDefinitions, projectRoot } = require('../src/lookup');

const files = {
  'aion.project': 'name = "demo"\n',
  'main.aion': `import util
import shapes.circle as c
from util import helper, Counter
import .local

type Animal(name: String) {
    fn speak() -> String = "..."
}

type Dog(name: String) : Animal(name) {
    override fn speak() -> String = "woof"
    fn describe() -> String = speak() + name
    fn twice() = this.speak() + super.speak()
}

enum Color { Red, Green }

fn run(count: Int) {
    total := count + 1
    for item in [1, 2] {
        total += item
    }
    d := Dog("rex")
    d.speak()
    util.helper(1)
    c.area(2.0)
    println(Color.Red, helper(2), Counter(), count)
    total += 1
}

fn later() {
    println(total)
}

// a comment about Dog
`,
  'util.aion': 'fn helper(n: Int) = n\ntype Counter(value: Int)\nfn _private() = 1\nvalue2 := 3\n',
  'local.aion': 'type Local(x: Int)\n',
  'lib/shapes/circle.aion': 'fn area(r: Float) = r * r\n',
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-lookup-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
for (const [name, text] of Object.entries(files)) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const exists = (file) => fs.existsSync(file) && fs.statSync(file).isFile();
const index = new SymbolIndex((file) => (exists(file) ? fs.readFileSync(file, 'utf8') : undefined));

/**
 * Where the name at `before§after` leads, as `file:line:character`, the file relative to the project.  `file`
 * holds the marked text in place of `before + after`.
 */
function definitions(file, before, after = '') {
  const full = path.join(dir, file);
  const text = fs.readFileSync(full, 'utf8');
  const marked = text.indexOf(before + after);
  assert.ok(marked >= 0, `not in ${file}: ${before + after}`);
  const offset = marked + before.length;
  const line = text.slice(0, offset).split('\n').length - 1;
  const character = offset - (text.lastIndexOf('\n', offset - 1) + 1);
  return findDefinitions({ file: full, text, line, character, index, exists, root: projectRoot(full, exists) })
    .map((at) => `${path.relative(dir, at.file).replace(/\\/g, '/')}:${at.line}:${at.character}`)
    .sort();
}

test('a type is found where it is declared, from a constructor call and a type annotation', () => {
  assert.deepEqual(definitions('main.aion', 'd := Do', 'g("rex")'), ['main.aion:9:5']);
  assert.deepEqual(definitions('main.aion', 'type Dog(name: String) : Ani', 'mal(name)'), ['main.aion:5:5']);
});

test('a parameter is found in its function, and a local at its latest earlier declaration', () => {
  assert.deepEqual(definitions('main.aion', 'total := cou', 'nt + 1'), ['main.aion:17:7']);
  assert.deepEqual(definitions('main.aion', '        tota', 'l += item'), ['main.aion:18:4']);
  assert.deepEqual(definitions('main.aion', 'total += it', 'em'), ['main.aion:19:8']);
  assert.deepEqual(definitions('main.aion', 'tot', 'al += 1'), ['main.aion:18:4']);
});

test('a local of another function is not seen', () => {
  assert.deepEqual(definitions('main.aion', 'println(Color.Red, helper(2), Counter(), cou', 'nt)'), ['main.aion:17:7']);
  assert.deepEqual(definitions('main.aion', 'println(tot', 'al)'), []);
});

test('an unqualified name inside a type finds the nearest declaration in the type and its parents', () => {
  assert.deepEqual(definitions('main.aion', 'fn describe() -> String = spe', 'ak() + name'), ['main.aion:10:16']);
  assert.deepEqual(definitions('main.aion', 'speak() + na', 'me'), ['main.aion:9:9']);
});

test('this and super pick the members of the right type', () => {
  assert.deepEqual(definitions('main.aion', 'this.spe', 'ak()'), ['main.aion:10:16']);
  assert.deepEqual(definitions('main.aion', 'super.spe', 'ak()'), ['main.aion:6:7']);
});

test('a member of a value of unknown type finds every declaration of that name', () => {
  assert.deepEqual(definitions('main.aion', 'd.spe', 'ak()'), ['main.aion:10:16', 'main.aion:6:7']);
});

test('a member qualified by a type name prefers that type', () => {
  assert.deepEqual(definitions('main.aion', 'Color.R', 'ed'), ['main.aion:15:13']);
});

test('modules: the import line, qualified names and names taken with from', () => {
  assert.deepEqual(definitions('main.aion', 'import ut', 'il\n'), ['util.aion:0:0']);
  assert.deepEqual(definitions('main.aion', 'import .lo', 'cal'), ['local.aion:0:0']);
  assert.deepEqual(definitions('main.aion', 'util.hel', 'per(1)'), ['util.aion:0:3']);
  assert.deepEqual(definitions('main.aion', 'c.ar', 'ea(2.0)'), ['lib/shapes/circle.aion:0:3']);
  assert.deepEqual(definitions('main.aion', 'from util import hel', 'per'), ['util.aion:0:3']);
  assert.deepEqual(definitions('main.aion', 'println(Color.Red, hel', 'per(2)'), ['util.aion:0:3']);
  assert.deepEqual(definitions('main.aion', 'helper(2), Coun', 'ter()'), ['util.aion:1:5']);
});

test('the name after an alias, and the folders of a path, lead to files', () => {
  assert.deepEqual(definitions('main.aion', 'import shapes.cir', 'cle as c'), ['lib/shapes/circle.aion:0:0']);
  assert.deepEqual(definitions('main.aion', 'import shapes.circle as ', 'c\n'), ['lib/shapes/circle.aion:0:0']);
});

test('a comment, a number and a name nobody declares lead nowhere', () => {
  assert.deepEqual(definitions('main.aion', '// a comment about D', 'og'), []);
  assert.deepEqual(definitions('main.aion', 'for item in [', '1, 2]'), []);
  assert.deepEqual(definitions('main.aion', 'print', 'ln(Color.Red'), []);
});

test('the project root is the folder of aion.project', () => {
  assert.equal(projectRoot(path.join(dir, 'lib', 'shapes', 'circle.aion'), exists), dir);
  assert.equal(projectRoot(path.join(os.tmpdir(), 'nowhere', 'x.aion'), () => false, '/fallback'), '/fallback');
});

test('the calculator example resolves the names a reader would click', { skip: !process.env.AION_REPO }, () => {
  const file = path.join(process.env.AION_REPO, 'examples', 'calculator.aion');
  const text = fs.readFileSync(file, 'utf8');
  // `§` marks where the cursor is in the line quoted
  const go = (spec) => {
    const offset = text.indexOf(spec.replace('§', '')) + spec.indexOf('§');
    const line = text.slice(0, offset).split('\n').length - 1;
    const character = offset - (text.lastIndexOf('\n', offset - 1) + 1);
    return findDefinitions({ file, text, line, character, index, exists, root: path.dirname(file) }).map((d) => d.line + 1);
  };
  assert.deepEqual(go('tokens.add(Tok§en("num"'), [12]);
  assert.deepEqual(go('Pars§er(tokenize(line))'), [118]);
  assert.deepEqual(go('Parser(token§ize(line))'), [14]);
  assert.deepEqual(go('vars.getOrNull(na§me)'), [54]);
  assert.deepEqual(go('-operand.ev§al(vars)'), [45, 50, 55, 64, 69, 88, 102]);
});
