'use strict';

const path = require('path');

/** A line without its `#` comment (a `#` inside a string stays). */
const stripComment = (line) => line.replace(/^((?:[^"#]|"[^"]*")*)#.*$/, '$1');

/**
 * What the extension needs from an `aion.project`: `packages` (where git dependencies are downloaded), `lib`, and the
 * `[dependencies]` as `{ name, path, git, tag, branch, rev }`.  It reads the lines the way `aion add` writes them.
 */
function parseProject(text) {
  const project = { packages: undefined, lib: undefined, dependencies: [] };
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    const header = /^\[\s*([^\]]*?)\s*\]$/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const entry = /^([A-Za-z_][\w-]*|"[^"]*")\s*=\s*(.*)$/.exec(line);
    if (!entry) continue;
    const key = entry[1].replace(/^"|"$/g, '');
    if (section === '') {
      const value = /^"([^"]*)"/.exec(entry[2]);
      if (value && key === 'packages') project.packages = value[1];
      if (value && key === 'lib') project.lib = value[1];
    } else if (section === 'dependencies') {
      const dependency = { name: key };
      for (const [, field, value] of entry[2].matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) dependency[field] = value;
      project.dependencies.push(dependency);
    }
  }
  return project;
}

/** The commits `aion.lock` pins, by the key `aion` writes: `<git url>#tag:v1`, `#branch:dev`, `#rev:abc` or `#HEAD`. */
function parseLock(text) {
  const pins = new Map();
  for (const line of text.split(/\r?\n/)) {
    const pin = /^"([^"]+)"\s*=\s*"([^"]+)"/.exec(line.trim());
    if (pin) pins.set(pin[1], pin[2]);
  }
  return pins;
}

function lockKey(dependency) {
  const ref = dependency.tag ? `tag:${dependency.tag}` : dependency.branch ? `branch:${dependency.branch}` : dependency.rev ? `rev:${dependency.rev}` : 'HEAD';
  return `${dependency.git}#${ref}`;
}

/** The first of the files that exists. */
const firstFile = (files, exists) => files.find((file) => exists(file));

/** The module a package offers as `import <name>`: its `lib`, else `lib.aion`, else `<name>.aion`. */
function libraryOf(dir, name, read, exists) {
  const manifest = read(path.join(dir, 'aion.project'));
  const lib = manifest === undefined ? undefined : parseProject(manifest).lib;
  return firstFile([...(lib ? [path.resolve(dir, lib)] : []), path.join(dir, 'lib.aion'), path.join(dir, `${name}.aion`)], exists);
}

/**
 * Where the packages `root` depends on are: `Map(name → { dir, library })`.  Path dependencies are found
 * where they point.  Git dependencies are found when the project keeps them in its `packages` folder, at the
 * commit `aion.lock` pins; the shared cache is not searched.
 *
 * @param {string} root  the project folder
 * @param {(file: string) => string | undefined} read
 * @param {(file: string) => boolean} exists  whether a file exists
 */
function dependencyRoots(root, read, exists) {
  const found = new Map();
  const manifest = read(path.join(root, 'aion.project'));
  if (manifest === undefined) return found;
  const project = parseProject(manifest);
  const pins = parseLock(read(path.join(root, 'aion.lock')) ?? '');
  for (const dependency of project.dependencies) {
    let dir;
    if (dependency.path) {
      dir = path.resolve(root, dependency.path);
    } else if (dependency.git && project.packages) {
      const commit = pins.get(lockKey(dependency));
      if (commit) dir = path.resolve(root, project.packages, `${dependency.name.replace(/[^\w-]/g, '_')}-${commit.slice(0, 12)}`);
    }
    if (dir) found.set(dependency.name, { dir, library: libraryOf(dir, dependency.name, read, exists) });
  }
  return found;
}

module.exports = { parseProject, parseLock, dependencyRoots };
