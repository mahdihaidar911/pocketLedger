const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, createSourceLoader, setup } = require('./helpers/database.cjs');
const { createAccount } = loadSource('src/repositories/accountRepository.ts');
const { createTransaction } = loadSource('src/repositories/transactionRepository.ts');

function nativeHarness(options = {}) {
  const files = new Map();
  const shareCalls = [];
  const createdDirectories = [];
  const deletedFiles = [];
  let uuidCounter = 0;
  let availabilityCalls = 0;
  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
    create(settings) { createdDirectories.push({ uri: this.uri, settings }); }
  }
  class File {
    constructor(directory, name) { this.uri = `${directory.uri}/${name}`; }
    get exists() { return files.has(this.uri); }
    create() {
      if (options.failCreate) throw new Error('Simulated file creation failure');
      if (this.exists) throw new Error('File already exists');
      files.set(this.uri, { content: '', encoding: null });
    }
    write(content, settings) {
      if (options.failWrite) throw new Error('Simulated write failure');
      files.set(this.uri, { content, encoding: settings.encoding });
    }
    delete() {
      deletedFiles.push(this.uri);
      files.delete(this.uri);
    }
  }
  const loader = createSourceLoader({
    'react-native': { Platform: { OS: options.os ?? 'ios' } },
    'expo-crypto': { randomUUID: () => `test-export-${++uuidCounter}` },
    'expo-file-system': { Directory, File, Paths: { cache: 'file:///test-private-cache' } },
    'expo-sharing': {
      async isAvailableAsync() {
        availabilityCalls++;
        if (options.availability) return options.availability();
        return options.available !== false;
      },
      async shareAsync(uri, settings) {
        shareCalls.push({ uri, settings });
        if (options.share) await options.share(uri, settings);
      },
    },
  });
  const { exportActivityCsv } = loader('src/services/activityCsvExportService.ts');
  const { ValidationError, logUnexpectedError } = loader('src/utils/errors.ts');
  return { exportActivityCsv, ValidationError, logUnexpectedError, files, shareCalls,
    createdDirectories, deletedFiles, get availabilityCalls() { return availabilityCalls; } };
}

async function fixture(t) {
  const { db } = await setup(t);
  const account = await createAccount(db, { name: 'Test', type: 'cash', currency: 'USD', openingBalanceMinor: 10000 });
  const selected = await createTransaction(db, { type: 'expense', accountId: account.id,
    categoryId: 'expense-groceries', amountMinor: 125, note: 'ExportCheck', occurredAt: '2026-09-02T12:00:00.000Z' });
  await createTransaction(db, { type: 'income', accountId: account.id, categoryId: 'income-salary', amountMinor: 500 });
  return { db, account, selected };
}

test('confirmed export prepares a private UTF-8 file and opens the OS chooser with CSV metadata', async (t) => {
  const { db, account, selected } = await fixture(t);
  const native = nativeHarness();
  const result = await native.exportActivityCsv(db, { searchText: 'ExportCheck' });
  assert.equal(result.status, 'prepared');
  assert.equal(result.rowCount, 1);
  assert.match(result.fileName, /^dailyfinance-.*\.csv$/);
  assert.equal(native.shareCalls.length, 1);
  const call = native.shareCalls[0];
  assert.match(call.uri, /^file:\/\/\/test-private-cache\/dailyfinance-csv-exports\//);
  assert.deepEqual(call.settings, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Save or share PocketLedger CSV' });
  const file = native.files.get(call.uri);
  assert.equal(file.encoding, 'utf8');
  assert.equal(file.content[0], '\uFEFF');
  assert.ok(file.content.includes('"ExportCheck"'));
  assert.equal(file.content.includes(selected.id), false);
  assert.equal(file.content.includes(account.id), false);
  assert.ok(file.content.includes('"occurred_at_local"'));
  assert.equal(file.content.includes('T12:00:00.000Z'), false);
  assert.equal(file.content.includes('"income"'), false);
  assert.deepEqual(native.deletedFiles, []);
});

test('Android uses the same local-file chooser flow and does not claim a saved destination', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness({ os: 'android' });
  const result = await native.exportActivityCsv(db, {});
  assert.equal(result.status, 'prepared');
  assert.equal(result.rowCount, 2);
  assert.equal('saved' in result, false);
  assert.equal('destination' in result, false);
});

test('the filter snapshot cannot change while sharing availability is checked', async (t) => {
  const { db } = await fixture(t);
  let proceed;
  const native = nativeHarness({ availability: () => new Promise((resolve) => { proceed = resolve; }) });
  const filters = { type: 'expense', searchText: 'ExportCheck' };
  const pending = native.exportActivityCsv(db, filters);
  filters.type = 'income';
  filters.searchText = 'anything else';
  proceed(true);
  const result = await pending;
  assert.equal(result.rowCount, 1);
  assert.ok([...native.files.values()][0].content.includes('"expense"'));
});

test('empty selections show a quiet validation error without creating files or sharing', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness();
  const error = await native.exportActivityCsv(db, { searchText: 'unmatched' }).catch((value) => value);
  assert.ok(error instanceof native.ValidationError);
  const spy = t.mock.method(console, 'error', () => {});
  native.logUnexpectedError('Export failed:', error);
  assert.equal(spy.mock.callCount(), 0);
  assert.equal(native.files.size, 0);
  assert.equal(native.createdDirectories.length, 0);
  assert.equal(native.shareCalls.length, 0);
});

test('unavailable sharing and unsupported web fail before querying or preparing data', async (t) => {
  const { db } = await fixture(t);
  const spy = t.mock.method(db, 'getAllAsync', db.getAllAsync.bind(db));
  for (const options of [{ available: false }, { os: 'web' }]) {
    const native = nativeHarness(options);
    await assert.rejects(native.exportActivityCsv(db, {}), native.ValidationError);
    assert.equal(native.files.size, 0);
    assert.equal(native.shareCalls.length, 0);
  }
  assert.equal(spy.mock.callCount(), 0);
});

test('cancelling before or during the initial read never opens the chooser', async (t) => {
  const { db } = await fixture(t);
  const first = nativeHarness();
  const cancelled = new AbortController();
  cancelled.abort();
  assert.deepEqual(await first.exportActivityCsv(db, {}, { signal: cancelled.signal }), { status: 'cancelled' });
  assert.equal(first.availabilityCalls, 0);

  const second = nativeHarness();
  const controller = new AbortController();
  const originalGet = db.getAllAsync.bind(db);
  t.mock.method(db, 'getAllAsync', async (...args) => {
    const result = await originalGet(...args);
    controller.abort();
    return result;
  });
  assert.deepEqual(await second.exportActivityCsv(db, {}, { signal: controller.signal }), { status: 'cancelled' });
  assert.equal(second.files.size, 0);
  assert.equal(second.shareCalls.length, 0);
});

test('query failures leave no partial file and never reach sharing', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness();
  t.mock.method(db, 'getAllAsync', async () => { throw new Error('Simulated database failure'); });
  await assert.rejects(native.exportActivityCsv(db, {}), /database failure/);
  assert.equal(native.files.size, 0);
  assert.equal(native.shareCalls.length, 0);
});

test('file write failures remove only the new partial file and keep older exports', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness({ failWrite: true });
  const older = 'file:///test-private-cache/dailyfinance-csv-exports/older.csv';
  native.files.set(older, { content: 'previous file' });
  await assert.rejects(native.exportActivityCsv(db, {}), /write failure/);
  assert.equal(native.files.size, 1);
  assert.equal(native.files.get(older).content, 'previous file');
  assert.equal(native.deletedFiles.length, 1);
  assert.notEqual(native.deletedFiles[0], older);
  assert.equal(native.shareCalls.length, 0);
});

test('file creation errors do not delete any existing export', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness({ failCreate: true });
  await assert.rejects(native.exportActivityCsv(db, {}), /creation failure/);
  assert.deepEqual(native.deletedFiles, []);
  assert.equal(native.shareCalls.length, 0);
});

test('a chooser failure is reported without claiming success or deleting a file another app may read', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness({ share: async () => { throw new Error('Simulated chooser failure'); } });
  await assert.rejects(native.exportActivityCsv(db, {}), /chooser failure/);
  assert.equal(native.files.size, 1);
  assert.deepEqual(native.deletedFiles, []);
});

test('repeated exports use distinct filenames and leave earlier cache copies intact', async (t) => {
  const { db } = await fixture(t);
  const native = nativeHarness();
  const first = await native.exportActivityCsv(db, {});
  const second = await native.exportActivityCsv(db, {});
  assert.notEqual(first.fileName, second.fileName);
  assert.equal(native.files.size, 2);
  assert.deepEqual(native.deletedFiles, []);
});
