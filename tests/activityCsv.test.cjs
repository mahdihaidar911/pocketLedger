const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, setup } = require('./helpers/database.cjs');
const { buildActivityCsv, formatCsvAmount, ACTIVITY_CSV_HEADERS } = loadSource('src/utils/activityCsv.ts');
const { getActivityForExport, getActivityPage } = loadSource('src/repositories/activityRepository.ts');
const { createAccount } = loadSource('src/repositories/accountRepository.ts');
const { createTransaction, updateTransaction, deleteTransaction } = loadSource('src/repositories/transactionRepository.ts');
const { createTransfer } = loadSource('src/repositories/transferRepository.ts');
const { ValidationError } = loadSource('src/utils/errors.ts');

// A small independent CSV reader checks field boundaries, including quoted
// newlines. No spreadsheet program, file sharing, or user database is opened.
function parseCsv(csv) {
  assert.equal(csv[0], '\uFEFF');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      assert.equal(field, '');
      quoted = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\r' && csv[i + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; i++;
    } else {
      assert.notEqual(char, '\n', 'unquoted line endings must use CRLF');
      field += char;
    }
  }
  assert.equal(quoted, false);
  assert.deepEqual(row, []);
  assert.equal(field, '');
  return rows;
}

function records(csv) {
  const [header, ...rows] = parseCsv(csv);
  assert.deepEqual(header, [...ACTIVITY_CSV_HEADERS]);
  return rows.map((row) => {
    assert.equal(row.length, header.length);
    return Object.fromEntries(header.map((key, index) => [key, row[index]]));
  });
}

function transaction(changes = {}) {
  return { kind: 'transaction', data: {
    id: 'test-entry', type: 'expense', accountId: 'account-a', accountName: 'Wallet',
    categoryId: null, categoryName: null, categoryIcon: null,
    amountMinor: 125, currency: 'USD', merchant: null, note: null,
    occurredAt: '2026-09-02T09:00:00.000Z', exchangeRateLbpPerUsd: null,
    createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T11:00:00.000Z', ...changes,
  } };
}

function useTimeZone(t, timeZone) {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

test('CSV has no ID columns, readable local dates, and numeric USD amount/change columns', (t) => {
  useTimeZone(t, 'UTC');
  assert.deepEqual([...ACTIVITY_CSV_HEADERS], [
    'type', 'occurred_at_local', 'account', 'currency', 'amount', 'account_change',
    'category', 'merchant', 'note', 'destination_account', 'destination_currency',
    'destination_amount', 'exchange_rate_lbp_per_usd', 'created_at_local', 'updated_at_local',
  ]);
  const csv = buildActivityCsv([transaction(), transaction({ type: 'income', amountMinor: 1 })]);
  const [expense, income] = records(csv);
  assert.equal(csv.includes('test-entry'), false);
  assert.equal(csv.includes('account-a'), false);
  assert.equal(expense.account, 'Wallet');
  assert.equal(expense.amount, '1.25');
  assert.equal(expense.account_change, '-1.25');
  assert.equal(income.amount, '0.01');
  assert.equal(income.account_change, '0.01');
  assert.equal(expense.occurred_at_local, '2026-09-02 09:00:00');
  assert.equal(expense.created_at_local, '2026-09-02 10:00:00');
  assert.equal(expense.updated_at_local, '2026-09-02 11:00:00');
  assert.match(buildActivityCsv([transaction()]), /,1\.25,-1\.25,/);
});

test('all CSV timestamps use the phone time zone, including local midnight rollover', (t) => {
  useTimeZone(t, 'Asia/Beirut');
  const [row] = records(buildActivityCsv([transaction({
    occurredAt: '2026-09-02T22:05:06.123Z',
    createdAt: '2026-09-02T21:00:00.000Z',
    updatedAt: '2026-09-03T00:30:00.000Z',
  })]));
  assert.equal(row.occurred_at_local, '2026-09-03 01:05:06');
  assert.equal(row.created_at_local, '2026-09-03 00:00:00');
  assert.equal(row.updated_at_local, '2026-09-03 03:30:00');
  for (const key of ['occurred_at_local', 'created_at_local', 'updated_at_local']) {
    assert.match(row[key], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.doesNotMatch(row[key], /[TZ]/);
  }
});

test('CSV local timestamps respect daylight-saving changes on the transaction date', (t) => {
  useTimeZone(t, 'America/New_York');
  const rows = records(buildActivityCsv([
    transaction({ occurredAt: '2026-03-08T06:59:00.000Z' }),
    transaction({ occurredAt: '2026-03-08T07:01:00.000Z' }),
  ]));
  assert.equal(rows[0].occurred_at_local, '2026-03-08 01:59:00');
  assert.equal(rows[1].occurred_at_local, '2026-03-08 03:01:00');
});

test('LBP remains whole units and large safe amounts do not round', () => {
  assert.equal(formatCsvAmount(1234567, 'LBP'), '1234567');
  assert.equal(formatCsvAmount(Number.MAX_SAFE_INTEGER, 'USD'), '90071992547409.91');
  assert.equal(formatCsvAmount(Number.MAX_SAFE_INTEGER, 'LBP'), '9007199254740991');
  assert.equal(records(buildActivityCsv([transaction({ currency: 'LBP', amountMinor: 89500 })]))[0].amount, '89500');
});

test('transfer rows keep source and destination currencies/amounts separate', () => {
  const item = { kind: 'transfer', data: {
    id: 'internal-transfer-id', sourceAccountId: 'internal-source-id', destinationAccountId: 'internal-destination-id',
    sourceAccountName: 'USD wallet', destinationAccountName: 'LBP wallet',
    sourceAmountMinor: 500, destinationAmountMinor: 447500, sourceCurrency: 'USD', destinationCurrency: 'LBP',
    exchangeRateLbpPerUsd: 89500, note: 'Convert', occurredAt: '2026-09-02T09:00:00.000Z',
    createdAt: '2026-09-02T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z',
  } };
  const csv = buildActivityCsv([item]);
  const [row] = records(csv);
  for (const id of [item.data.id, item.data.sourceAccountId, item.data.destinationAccountId]) {
    assert.equal(csv.includes(id), false);
  }
  assert.equal(row.type, 'transfer');
  assert.equal(row.account, 'USD wallet');
  assert.equal(row.currency, 'USD');
  assert.equal(row.amount, '5.00');
  assert.equal(row.account_change, '-5.00');
  assert.equal(row.destination_currency, 'LBP');
  assert.equal(row.destination_amount, '447500');
  assert.equal(row.exchange_rate_lbp_per_usd, '89500');
  assert.equal(row.destination_account, 'LBP wallet');
  assert.equal(row.category, '');
});

test('null values are empty cells, never the words null or undefined', () => {
  const [row] = records(buildActivityCsv([transaction()]));
  for (const key of ['merchant', 'note', 'destination_account', 'destination_currency', 'destination_amount', 'exchange_rate_lbp_per_usd']) assert.equal(row[key], '');
  assert.equal(row.category, 'Uncategorized');
});

test('commas, quotes, multiline notes, and Arabic text round-trip as single cells', () => {
  const input = transaction({ merchant: 'Store, "A"', accountName: 'محفظتي 💵', note: 'First line\nSecond, "quoted"\r\nThird line' });
  const [row] = records(buildActivityCsv([input]));
  assert.equal(row.merchant, input.data.merchant);
  assert.equal(row.account, input.data.accountName);
  assert.equal(row.note, input.data.note);
  assert.equal(Buffer.from(buildActivityCsv([input]), 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
});

test('formula-like free text is guarded, including whitespace and full-width prefixes', () => {
  for (const value of ['=1+1', '+123', '-Store', '@SUM(1)', '   =1+1', '\t=1+1', '\r=1+1', '\n=1+1',
    '\uFEFF=1+1', '\u0000=1+1', '＝1+1', '＋1', '－1', '＠SUM(1)', '\tordinary text']) {
    const [row] = records(buildActivityCsv([transaction({ merchant: value, note: value, accountName: value, categoryName: value })]));
    for (const key of ['merchant', 'note', 'account', 'category']) assert.equal(row[key], `'${value}`);
    assert.equal(row.account_change, '-1.25', 'trusted numeric cells remain numeric');
  }
  const [row] = records(buildActivityCsv([transaction({ note: 'plain,\"=1+1;\"' })]));
  assert.equal(row.note, 'plain,\"=1+1;\"');
});

test('formatting does not mutate source records', () => {
  const item = transaction({ note: '=1+1' });
  const original = structuredClone(item);
  buildActivityCsv([item]);
  assert.deepEqual(item, original);
});

test('invalid stored values fail visibly instead of producing misleading numeric data', () => {
  for (const amount of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatCsvAmount(amount, 'USD'), /invalid transaction amount/);
  }
  assert.throws(() => formatCsvAmount(1, 'EUR'), /unsupported currency/);
  assert.throws(() => buildActivityCsv([transaction({ occurredAt: 'invalid' })]), /invalid transaction date/);
  assert.throws(() => buildActivityCsv([transaction({ exchangeRateLbpPerUsd: 0 })]), /invalid exchange rate/);
});

async function fixture(t) {
  const { db } = await setup(t);
  const a = await createAccount(db, { name: 'A', type: 'cash', currency: 'USD', openingBalanceMinor: 100000 });
  const b = await createAccount(db, { name: 'B', type: 'bank', currency: 'USD', openingBalanceMinor: 100000 });
  const expense = await createTransaction(db, { type: 'expense', accountId: a.id, categoryId: 'expense-groceries',
    amountMinor: 2500, merchant: 'ExportCheck Store', note: 'Receipt', occurredAt: '2026-09-02T12:00:00.000Z' });
  const income = await createTransaction(db, { type: 'income', accountId: b.id, categoryId: 'income-salary',
    amountMinor: 5000, note: 'ExportCheck Pay', occurredAt: '2026-09-01T12:00:00.000Z' });
  const transfer = await createTransfer(db, { sourceAccountId: a.id, destinationAccountId: b.id,
    amountMinor: 500, note: 'ExportCheck Move', occurredAt: '2026-09-03T12:00:00.000Z' });
  return { db, a, b, expense, income, transfer };
}

test('export query matches the same combined filters and ordering as the list', async (t) => {
  const { db, a, b } = await fixture(t);
  for (const filters of [{}, { searchText: 'ExportCheck' }, { type: 'expense', accountId: a.id },
    { type: 'transfer', accountId: b.id }, { searchText: 'store', startIso: '2026-09-02T00:00:00.000Z', endIso: '2026-09-03T00:00:00.000Z' }]) {
    assert.deepEqual(await getActivityForExport(db, filters), (await getActivityPage(db, filters)).items);
  }
});

test('export includes more than 100 filtered rows in a single read, without Load More', async (t) => {
  const { db, a } = await fixture(t);
  for (let i = 0; i < 125; i++) await createTransaction(db, {
    type: 'expense', accountId: a.id, categoryId: null, amountMinor: 1, merchant: `Full export ${i}`,
    occurredAt: '2026-09-04T12:00:00.000Z',
  });
  const filters = { searchText: 'Full export' };
  assert.equal((await getActivityPage(db, filters)).items.length, 50);
  const spy = t.mock.method(db, 'getAllAsync', db.getAllAsync.bind(db));
  const items = await getActivityForExport(db, filters);
  assert.equal(spy.mock.callCount(), 1);
  assert.equal(items.length, 125);
  const exported = records(buildActivityCsv(items));
  assert.equal(exported.length, 125);
  assert.equal(new Set(exported.map((row) => row.merchant)).size, 125);
});

test('exporting inactive-account history does not change financial records or schema', async (t) => {
  const { db, b } = await fixture(t);
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', b.id);
  const tables = ['accounts', 'transactions', 'transfers', 'categories', 'recurring_payments'];
  const before = await Promise.all(tables.map((table) => db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)));
  assert.equal(records(buildActivityCsv(await getActivityForExport(db, { accountId: b.id }))).length, 2);
  assert.deepEqual(await Promise.all(tables.map((table) => db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
});

test('a fresh export reflects edits and deletions instead of cached screen rows', async (t) => {
  const { db, expense } = await fixture(t);
  await updateTransaction(db, expense.id, { expectedUpdatedAt: expense.updatedAt, type: expense.type,
    accountId: expense.accountId, categoryId: expense.categoryId, amountMinor: 4000, merchant: 'Edited', note: 'Corrected' });
  const [item] = await getActivityForExport(db, { searchText: 'Edited' });
  assert.equal(records(buildActivityCsv([item]))[0].amount, '40.00');
  await deleteTransaction(db, item.data.id, item.data.updatedAt);
  assert.deepEqual(await getActivityForExport(db, { searchText: 'Edited' }), []);
});

test('empty or invalid selections cannot silently export unrelated history', async (t) => {
  const { db } = await fixture(t);
  assert.deepEqual(await getActivityForExport(db, { searchText: 'unmatched' }), []);
  assert.equal(records(buildActivityCsv([])).length, 0);
  await assert.rejects(getActivityForExport(db, { startIso: 'bad-date' }), ValidationError);
});
