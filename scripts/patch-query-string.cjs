'use strict';

// query-string 7 is CommonJS; its patched decoder (0.5.0) is ESM-only.
// Keep Expo Router's existing query-string API and bridge the decoder's default
// export. Node >=22.13 and Metro support this ESM interop. This is deliberately
// version-specific: review/remove it when Expo Router adopts a patched parser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const projectRoot = path.resolve(__dirname, '..');
const fromProject = createRequire(path.join(projectRoot, 'package.json'));
const fromRouter = createRequire(fromProject.resolve('expo-router/package.json'));
const entry = fs.realpathSync(fromRouter.resolve('query-string'));
assert.ok(entry.startsWith(path.join(fs.realpathSync(projectRoot), 'node_modules') + path.sep),
  'Refusing to patch query-string outside this project’s node_modules.');
const fromQuery = createRequire(entry);
const queryVersion = fromQuery('./package.json').version;
const decoderEntry = fromQuery.resolve('decode-uri-component');
const decoderVersion = JSON.parse(fs.readFileSync(path.join(path.dirname(decoderEntry), 'package.json'), 'utf8')).version;
assert.equal(queryVersion, '7.1.3', 'Review the query-string security bridge for this version.');
assert.equal(decoderVersion, '0.5.0', 'The patched decoder must be installed before applying the bridge.');
assert.equal(typeof fromQuery('decode-uri-component').default, 'function', 'Expected an ESM default decoder export.');

const before = "const decodeComponent = require('decode-uri-component');";
const after = "const decodeComponent = require('decode-uri-component').default;";
const source = fs.readFileSync(entry, 'utf8');
if (source.includes(after) && !source.includes(before)) {
  console.log('query-string security bridge already applied.');
} else {
  assert.equal(source.split(before).length, 2, 'Unexpected query-string source; refusing an unverified patch.');
  fs.writeFileSync(entry, source.replace(before, after), 'utf8');
  console.log('Applied query-string security bridge for decode-uri-component 0.5.0.');
}
