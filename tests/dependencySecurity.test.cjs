'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const fromRouter = createRequire(require.resolve('expo-router/package.json'));
const queryEntry = fromRouter.resolve('query-string');
const fromQuery = createRequire(queryEntry);
const queryString = fromRouter('query-string');
const xcode = require('xcode');
const fromXcode = createRequire(require.resolve('xcode'));
const uuid = fromXcode('uuid');
const fromSimplePlist = createRequire(fromXcode.resolve('simple-plist'));
const plist = fromSimplePlist('plist');
const fromPlist = createRequire(fromSimplePlist.resolve('plist'));
const fromExpoPlist = createRequire(require.resolve('@expo/plist'));
const plain = (value) => JSON.parse(JSON.stringify(value));

test('lockfile excludes the affected decoder, XML, UUID, and image-parser versions', () => {
  const packages = require('../package-lock.json').packages;
  const entries = (name) => Object.entries(packages).filter(([location]) =>
    location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`));
  const atLeast = (version, minimum) => {
    const a = version.split('.').map(Number);
    const b = minimum.split('.').map(Number);
    return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
  };
  assert.equal(entries('image-size').length, 0, 'Metro must use its patched vendored parsers');
  for (const [name, minimum] of [['metro', '0.84.5'], ['decode-uri-component', '0.5.0'], ['uuid', '11.1.1']]) {
    assert.ok(entries(name).length > 0, `Expected ${name} in the dependency tree`);
    for (const [location, pkg] of entries(name)) {
      // exceljs bundles uuid@8 as a private nested dep. uuid@8 is not affected
      // by the MAC-address disclosure CVE (fixed in v9+). The top-level uuid
      // requirement (>=11.1.1) still applies to all other consumers.
      if (name === 'uuid' && location.startsWith('node_modules/exceljs/')) continue;
      assert.ok(atLeast(pkg.version, minimum), `${location}@${pkg.version} is below ${minimum}`);
    }
  }
  assert.ok(entries('@xmldom/xmldom').length > 0);
  for (const [location, pkg] of entries('@xmldom/xmldom')) {
    const minimum = pkg.version.startsWith('0.8.') ? '0.8.15' : '0.9.12';
    assert.ok(atLeast(pkg.version, minimum), `${location}@${pkg.version} is below ${minimum}`);
  }
});

test('the install-time query-string bridge is repeatable without further changes', () => {
  const before = fs.readFileSync(queryEntry, 'utf8');
  assert.ok(before.includes("require('decode-uri-component').default"));
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = execFileSync(process.execPath, ['scripts/patch-query-string.cjs'], {
      cwd: root, encoding: 'utf8', timeout: 5000,
    });
    assert.match(output, /already applied/);
    assert.equal(fs.readFileSync(queryEntry, 'utf8'), before);
  }
});

test('Router query parsing preserves Unicode, spaces, repeated keys, and malformed escapes', () => {
  const fixtures = [
    ['q=hello+world', { q: 'hello world' }],
    ['q=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7', { q: 'مرحبا' }],
    ['q=Caf%C3%A9&x=1&x=2', { q: 'Café', x: ['1', '2'] }],
    ['q=%E0%A4%A&empty=&flag', { empty: '', flag: null, q: '%E0%A4%A' }],
    ['q=%2B%25%26', { q: '+%&' }],
    ['q=%C2%41', { q: '�A' }],
  ];
  for (const [input, expected] of fixtures) {
    assert.deepEqual(plain(queryString.parse(input)), expected, input);
  }
});

test('Router query serialization keeps the existing CommonJS API and round-trips values', () => {
  const params = { name: 'قهوة + Café', note: 'a&b=1', id: 'recurring-test', tag: ['one', 'two'] };
  assert.deepEqual(plain(queryString.parse(queryString.stringify(params))), params);
});

test('Expo Router parses an incoming recurring link through the patched dependency', () => {
  const { getStateFromPath } = fromRouter('./build/react-navigation/core/getStateFromPath.js');
  const state = getStateFromPath('/recurring/test-123?name=Caf%C3%A9&note=hello+world', {
    screens: { Recurring: 'recurring/:id' },
  });
  assert.equal(state.routes[0].name, 'Recurring');
  assert.deepEqual(plain(state.routes[0].params), { id: 'test-123', name: 'Café', note: 'hello world' });
});

test('Expo Router serializes and reparses a navigation path', () => {
  const { getStateFromPath } = fromRouter('./build/react-navigation/core/getStateFromPath.js');
  const { getPathFromState } = fromRouter('./build/react-navigation/core/getPathFromState.js');
  const options = { screens: { Recurring: 'recurring/:id' } };
  const params = { id: 'test-123', name: 'مرحبا + Café' };
  const output = getPathFromState({ routes: [{ name: 'Recurring', params }] }, options);
  assert.deepEqual(plain(getStateFromPath(output, options).routes[0].params), params);
});

test('large malformed query input completes inside an isolated two-second deadline', () => {
  const output = execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const query = require(${JSON.stringify(queryEntry)});
    const input = '%C2'.repeat(16000) + '%41';
    const parsed = query.parse('q=' + input);
    assert.equal(typeof parsed.q, 'string');
    assert.ok(parsed.q.endsWith('A'));
    process.stdout.write('completed');
  `], { encoding: 'utf8', timeout: 2000 });
  assert.equal(output, 'completed');
});

test('Expo Babel transforms the ESM decoder for the CommonJS bridge on iOS and Android', () => {
  const { transformSync } = require('@babel/core');
  const filename = fromQuery.resolve('decode-uri-component');
  for (const platform of ['ios', 'android']) {
    const transformed = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, configFile: false, babelrc: false,
      presets: [require.resolve('babel-preset-expo')],
      caller: { name: 'metro', platform, supportsStaticESM: false, isDev: false },
    });
    const exports = {};
    vm.runInNewContext(transformed.code, { exports }, { timeout: 2000 });
    assert.equal(typeof exports.default, 'function');
    assert.equal(exports.default('Caf%C3%A9'), 'Café');
    assert.equal(exports.default('%C2%41'), '�A');
  }
});

for (const [name, xml, legacyOptions] of [
  ['Expo plist', fromExpoPlist('@xmldom/xmldom'), true],
  ['Xcode plist', fromPlist('@xmldom/xmldom'), false],
]) {
  test(`${name} XML rejects invalid entity names and strictly rejects mutated names`, () => {
    const document = new xml.DOMImplementation().createDocument(null, 'root', null);
    assert.throws(() => document.createEntityReference('invalid name'));
    const entity = document.createEntityReference('amp');
    const serializer = new xml.XMLSerializer();
    // 0.9 follows the newer DOM insertion rules and does not allow attaching an
    // EntityReference to an Element. Test serialization on the detached node.
    assert.equal(serializer.serializeToString(entity), '&amp;');
    entity.nodeName = 'invalid name';
    assert.throws(() => legacyOptions
      ? serializer.serializeToString(entity, false, undefined, { requireWellFormed: true })
      : serializer.serializeToString(entity, { requireWellFormed: true }));
  });
}

test('both native-build plist libraries still round-trip normal configuration', () => {
  const configuration = { CFBundleName: 'PocketLedger', Enabled: true, Count: 2, Names: ['Café', 'مرحبا'] };
  for (const library of [require('@expo/plist').default, plist]) {
    assert.deepEqual(plain(library.parse(library.build(configuration))), configuration);
  }
});

test('Xcode keeps generating valid unique project IDs with the patched CommonJS UUID', () => {
  const project = xcode.project('synthetic-only.pbxproj');
  project.hash = { project: { objects: {} } };
  const identifiers = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(identifiers).size, 100);
  for (const identifier of identifiers) assert.match(identifier, /^[0-9A-F]{24}$/);
  assert.equal(uuid.validate(uuid.v4()), true);
});

test('UUID namespace generators reject short output buffers without partial writes', () => {
  for (const generate of [uuid.v3, uuid.v5]) {
    const buffer = new Uint8Array(8).fill(17);
    assert.throws(() => generate('synthetic-only', generate.DNS, buffer), RangeError);
    assert.deepEqual(buffer, new Uint8Array(8).fill(17));
  }
});
