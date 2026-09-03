const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, setup } = require('./helpers/database.cjs');

const { getActivityPage, getRecentActivity } = loadSource('src/repositories/activityRepository.ts');
const { createAccount, getAllAccounts } = loadSource('src/repositories/accountRepository.ts');
const { createTransaction, updateTransaction, deleteTransaction } = loadSource('src/repositories/transactionRepository.ts');
const { createTransfer } = loadSource('src/repositories/transferRepository.ts');
const { ValidationError } = loadSource('src/utils/errors.ts');
const { getActivityDateRange } = loadSource('src/utils/activityDates.ts');

async function fixture(t) {
  const { db } = await setup(t);
  const wallet = await createAccount(db, { name: 'Daily Wallet', type: 'cash', currency: 'USD', openingBalanceMinor: 100000 });
  const bank = await createAccount(db, { name: 'Bank Reserve', type: 'bank', currency: 'USD', openingBalanceMinor: 100000 });
  const coffee = await createTransaction(db, { type: 'expense', accountId: wallet.id,
    categoryId: 'expense-food-dining', amountMinor: 500, merchant: 'Morning Coffee', note: 'Receipt_%\\42',
    occurredAt: '2026-09-02T09:00:00.000Z' });
  const salary = await createTransaction(db, { type: 'income', accountId: bank.id,
    categoryId: 'income-salary', amountMinor: 50000, merchant: 'Employer', note: 'September payroll',
    occurredAt: '2026-09-01T09:00:00.000Z' });
  const groceries = await createTransaction(db, { type: 'expense', accountId: wallet.id,
    categoryId: 'expense-groceries', amountMinor: 4000, merchant: 'Market', note: 'Weekend shopping',
    occurredAt: '2026-08-31T09:00:00.000Z' });
  const transfer = await createTransfer(db, { sourceAccountId: wallet.id, destinationAccountId: bank.id,
    amountMinor: 1000, note: 'Top up reserve', occurredAt: '2026-09-02T15:00:00.000Z' });
  return { db, wallet, bank, coffee, salary, groceries, transfer };
}

function ids(page) { return page.items.map((item) => item.data.id); }
function keys(page) { return page.items.map((item) => `${item.kind}:${item.data.id}`); }
async function allPages(db, filters = {}, limit = 2) {
  const result = [];
  let cursor = null;
  do {
    const page = await getActivityPage(db, filters, { limit, cursor });
    result.push(...keys(page));
    cursor = page.nextCursor;
    assert.ok(result.length < 1000, 'pagination must terminate');
  } while (cursor);
  return result;
}

test('unfiltered history matches existing activity models and leaves schema/data unchanged', async (t) => {
  const { db } = await fixture(t);
  const before = await getAllAccounts(db);
  const page = await getActivityPage(db);
  assert.deepEqual(page.items, await getRecentActivity(db));
  assert.equal(page.nextCursor, null);
  assert.deepEqual(await getAllAccounts(db), before);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
});

test('search matches merchant, note, category, and both transfer account names', async (t) => {
  const { db, coffee, salary, groceries, transfer } = await fixture(t);
  for (const [text, expected] of [
    ['  COFFEE  ', [coffee.id]], ['payroll', [salary.id]], ['Groceries', [groceries.id]],
    ['top up', [transfer.id]], ['Daily Wallet', [transfer.id, coffee.id, groceries.id]],
    ['Bank Reserve', [transfer.id, salary.id]],
  ]) assert.deepEqual(ids(await getActivityPage(db, { searchText: text })), expected);
});

test('search treats wildcard characters, backslashes, and SQL-looking text literally', async (t) => {
  const { db, coffee } = await fixture(t);
  for (const searchText of ['%', '_', '\\', 'Receipt_%\\42']) {
    assert.deepEqual(ids(await getActivityPage(db, { searchText })), [coffee.id]);
  }
  assert.deepEqual(ids(await getActivityPage(db, { searchText: "' OR 1=1 --" })), []);
  assert.equal((await getActivityPage(db, { searchText: '   ' })).items.length, 4);
});

test('expense, income, and transfer filters exclude the other kinds', async (t) => {
  const { db, coffee, salary, groceries, transfer } = await fixture(t);
  assert.deepEqual(ids(await getActivityPage(db, { type: 'expense' })), [coffee.id, groceries.id]);
  assert.deepEqual(ids(await getActivityPage(db, { type: 'income' })), [salary.id]);
  assert.deepEqual(ids(await getActivityPage(db, { type: 'transfer' })), [transfer.id]);
});

test('account filtering includes incoming and outgoing transfers, including inactive accounts', async (t) => {
  const { db, wallet, bank, coffee, salary, groceries, transfer } = await fixture(t);
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', bank.id);
  assert.deepEqual(ids(await getActivityPage(db, { accountId: wallet.id })), [transfer.id, coffee.id, groceries.id]);
  assert.deepEqual(ids(await getActivityPage(db, { accountId: bank.id })), [transfer.id, salary.id]);
  assert.deepEqual(ids(await getActivityPage(db, { accountId: 'missing' })), []);
  assert.equal((await getAllAccounts(db)).find((item) => item.id === bank.id).isActive, false);
});

test('search, type, account, and dates combine before limiting results', async (t) => {
  const { db, wallet, coffee } = await fixture(t);
  const page = await getActivityPage(db, { searchText: 'coffee', type: 'expense', accountId: wallet.id,
    startIso: '2026-09-01T00:00:00.000Z', endIso: '2026-10-01T00:00:00.000Z' }, { limit: 1 });
  assert.deepEqual(ids(page), [coffee.id]);
  assert.equal(page.nextCursor, null);
  assert.equal((await getActivityPage(db, { searchText: 'coffee', type: 'income' })).items.length, 0);
});

test('search finds a matching transaction older than the latest 50 entries', async (t) => {
  const { db, wallet, groceries } = await fixture(t);
  for (let i = 0; i < 65; i++) {
    await createTransaction(db, { type: 'expense', accountId: wallet.id, categoryId: null,
      amountMinor: 1, merchant: `New item ${i}`, occurredAt: '2026-09-03T12:00:00.000Z' });
  }
  assert.equal((await getActivityPage(db)).items.length, 50);
  const match = await getActivityPage(db, { searchText: 'Weekend shopping' });
  assert.deepEqual(ids(match), [groceries.id]);
  assert.equal((await allPages(db, {}, 17)).length, 69);
});

test('equal timestamps and matching IDs across tables paginate without gaps or duplicates', async (t) => {
  const { db, coffee, transfer } = await fixture(t);
  await db.runAsync('UPDATE transfers SET id = ? WHERE id = ?', coffee.id, transfer.id);
  for (const table of ['transactions', 'transfers']) {
    await db.runAsync(`UPDATE ${table} SET occurred_at = ?, created_at = ?`,
      '2026-09-02T12:00:00.000Z', '2026-09-02T12:00:00.000Z');
  }
  const expected = keys(await getActivityPage(db));
  assert.deepEqual(await allPages(db, {}, 1), expected);
  assert.equal(new Set(expected).size, 4);
});

test('newer inserts and deletion of a loaded row do not shift the next page', async (t) => {
  const { db, wallet } = await fixture(t);
  const initial = await getActivityPage(db);
  const first = await getActivityPage(db, {}, { limit: 2 });
  const loadedTransaction = first.items.find((item) => item.kind === 'transaction').data;
  await deleteTransaction(db, loadedTransaction.id, loadedTransaction.updatedAt);
  await createTransaction(db, { type: 'income', accountId: wallet.id, categoryId: null,
    amountMinor: 100, occurredAt: '2026-09-04T00:00:00.000Z' });
  const second = await getActivityPage(db, {}, { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(keys(second), keys(initial).slice(2));
  assert.equal(second.nextCursor, null);
});

test('filtered pagination stays within the selected kind and search', async (t) => {
  const { db, wallet } = await fixture(t);
  for (let i = 0; i < 7; i++) {
    await createTransaction(db, { type: 'income', accountId: wallet.id, categoryId: null,
      amountMinor: 100, merchant: 'Side job', occurredAt: '2026-09-03T12:00:00.000Z' });
  }
  const filters = { searchText: 'job', type: 'income', accountId: wallet.id };
  const expected = keys(await getActivityPage(db, filters));
  assert.equal(expected.length, 7);
  assert.deepEqual(await allPages(db, filters, 3), expected);
});

test('date boundaries include the start and exclude exactly the next day', async (t) => {
  const { db, wallet } = await fixture(t);
  const range = getActivityDateRange({ preset: 'custom', fromDate: '2026-09-05', toDate: '2026-09-05' });
  const stamps = [new Date(Date.parse(range.startIso) - 1).toISOString(), range.startIso,
    new Date(Date.parse(range.endIso) - 1).toISOString(), range.endIso];
  const created = [];
  for (const occurredAt of stamps) created.push(await createTransaction(db, {
    type: 'income', accountId: wallet.id, categoryId: null, amountMinor: 100, occurredAt,
  }));
  assert.deepEqual(ids(await getActivityPage(db, range)), [created[2].id, created[1].id]);
});

test('renames, recategorization, and deletion are reflected when the query refreshes', async (t) => {
  const { db, coffee } = await fixture(t);
  await updateTransaction(db, coffee.id, { expectedUpdatedAt: coffee.updatedAt,
    type: coffee.type, accountId: coffee.accountId, categoryId: 'expense-groceries',
    amountMinor: coffee.amountMinor, merchant: 'New shop', note: null });
  assert.equal((await getActivityPage(db, { searchText: 'Coffee' })).items.length, 0);
  const match = await getActivityPage(db, { searchText: 'New shop' });
  assert.deepEqual(ids(match), [coffee.id]);
  assert.equal(match.items[0].data.categoryName, 'Groceries');
  await deleteTransaction(db, coffee.id, match.items[0].data.updatedAt);
  assert.equal((await getActivityPage(db, { searchText: 'New shop' })).items.length, 0);
});

test('cross-currency transfers retain both exact amounts and currencies', async (t) => {
  const { db, wallet } = await fixture(t);
  const lbp = await createAccount(db, { name: 'LBP cash', type: 'cash', currency: 'LBP', openingBalanceMinor: 0 });
  await db.runAsync(`INSERT INTO transfers
    (id, source_account_id, destination_account_id, source_amount_minor, destination_amount_minor,
     source_currency, destination_currency, exchange_rate_lbp_per_usd, occurred_at, created_at, updated_at)
    VALUES ('cross-transfer', ?, ?, 500, 447500, 'USD', 'LBP', 89500,
      '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z')`, wallet.id, lbp.id);
  const page = await getActivityPage(db, { type: 'transfer', accountId: lbp.id });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].kind, 'transfer');
  assert.equal(page.items[0].data.sourceAmountMinor, 500);
  assert.equal(page.items[0].data.destinationAmountMinor, 447500);
  assert.equal(page.items[0].data.sourceCurrency, 'USD');
  assert.equal(page.items[0].data.destinationCurrency, 'LBP');
  assert.equal(page.items[0].data.exchangeRateLbpPerUsd, 89500);
});

test('invalid limits, date ranges, types, and cursors are validation errors', async (t) => {
  const { db } = await fixture(t);
  for (const limit of [0, -1, 1.2, 101, NaN]) await assert.rejects(getActivityPage(db, {}, { limit }), ValidationError);
  for (const filters of [{ type: 'invalid' }, { startIso: 'bad' }, { startIso: '2026-09-02' },
    { startIso: '2026-09-02T00:00:00.000Z', endIso: '2026-09-01T00:00:00.000Z' }]) {
    await assert.rejects(getActivityPage(db, filters), ValidationError);
  }
  await assert.rejects(getActivityPage(db, {}, { cursor: { id: '', kind: 'transfer', occurredAt: 'bad', createdAt: 'bad' } }), ValidationError);
});

test('empty history and no matches return an empty page without a next cursor', async (t) => {
  const { db } = await setup(t);
  assert.deepEqual(await getActivityPage(db), { items: [], nextCursor: null });
  assert.deepEqual(await getActivityPage(db, { searchText: 'unmatched', type: 'expense' }), { items: [], nextCursor: null });
});
