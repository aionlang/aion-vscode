'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { binaryFor, run, isMissing, formatText } = require('../src/compiler');

// A stand-in for `aion`: node runs this script, and the script plays the compiler.
const fake = path.join(os.tmpdir(), `fake-aion-${process.pid}.js`);
fs.writeFileSync(
  fake,
  `
const fs = require('fs');
const [command, file] = process.argv.slice(2);
if (command === 'check') {
  console.error('error: boom\\n --> ' + file + ':1:1\\n  |\\n1 | x\\n  | ^');
  process.exit(1);
}
if (command === 'fmt') {
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/[ \\t]+$/gm, ''));
}
`,
);
test.after(() => fs.rmSync(fake, { force: true }));

test('the binary is aion unless the setting says otherwise', () => {
  assert.equal(binaryFor(undefined), 'aion');
  assert.equal(binaryFor('  '), 'aion');
  assert.equal(binaryFor(' /opt/aion/bin/aion '), '/opt/aion/bin/aion');
});

test('run collects output and the exit status', async () => {
  const result = await run(process.execPath, [fake, 'check', 'a.aion']);
  assert.equal(result.code, 1);
  assert.match(result.output, /error: boom/);
  assert.match(result.output, /--> a\.aion:1:1/);
  assert.equal(result.failure, undefined);
});

test('a missing binary is reported, not thrown', async () => {
  const result = await run('definitely-not-an-aion-binary', ['check']);
  assert.ok(isMissing(result));
  assert.equal(result.code, null);
});

test('formatText returns what fmt wrote', async () => {
  const formatted = await formatText(process.execPath, 'x := 1   \nprintln(x)\t\n', [fake]);
  assert.equal(formatted, 'x := 1\nprintln(x)\n');
});

test('formatText cleans up after itself', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('aion-fmt-')).length;
  await formatText(process.execPath, 'a\n', [fake]);
  const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('aion-fmt-')).length;
  assert.equal(after, before);
});

test('formatText rejects with the compiler message when fmt fails', async () => {
  // a stand-in that always fails, as the compiler does on a file it cannot read
  const wrapper = path.join(os.tmpdir(), `fake-aion-bad-${process.pid}.js`);
  fs.writeFileSync(wrapper, "console.error('error: unterminated string'); process.exit(1);");
  try {
    await assert.rejects(formatText(process.execPath, 'x := "\n', [wrapper]), /unterminated string/);
  } finally {
    fs.rmSync(wrapper, { force: true });
  }
});
