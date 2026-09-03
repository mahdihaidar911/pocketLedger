const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, setup } = require('./helpers/database.cjs');

const repository = loadSource('src/repositories/transactionRepository.ts');
const { createAccount, getAccountById } = loadSource('src/repositories/accountRepository.ts');
const { createTransfer } = loadSource('src/repositories/transferRepository.ts');
const { getRecentActivity } = loadSource('src/repositories/activityRepository.ts');
const { getMonthlyReport } = loadSource('src/repositories/reportRepository.ts');
const { recordRecurringPayment } = loadSource('src/repositories/recurringPaymentRepository.ts');
const { ValidationError, logUnexpectedError } = loadSource('src/utils/errors.ts');

async function fixture(t, currency = 'USD') {
  const { db } = await setup(t);
  const a = await createAccount(db, { name: 'Test A', type: 'cash', currency, openingBalanceMinor: 10000 });
  const b = await createAccount(db, { name: 'Test B', type: 'bank', currency, openingBalanceMinor: 20000 });
  const item = await repository.createTransaction(db, {
    type: 'expense', accountId: a.id, categoryId: 'expense-groceries', amountMinor: 2500,
    merchant: '  Test shop  ', note: '  Receipt  ', occurredAt: '2026-09-02T12:00:00.000Z',
    exchangeRateLbpPerUsd: 89500,
  });
  return { db, a, b, item };
}

function editInput(item, changes = {}) {
  return { expectedUpdatedAt: item.updatedAt, type: item.type, accountId: item.accountId,
    categoryId: item.categoryId, amountMinor: item.amountMinor, merchant: item.merchant,
    note: item.note, ...changes };
}
async function edit(db, item, changes) {
  await repository.updateTransaction(db, item.id, editInput(item, changes));
  return repository.getTransactionById(db, item.id);
}
async function balance(db, id) { return (await getAccountById(db, id)).balanceMinor; }
function expectValidation(promise, message) {
  return assert.rejects(promise, (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, message);
    return true;
  });
}
async function snapshot(db) {
  return { accounts: await db.getAllAsync('SELECT * FROM accounts ORDER BY id'),
    transactions: await db.getAllAsync('SELECT * FROM transactions ORDER BY id') };
}

test('details and corrections work on the migrated schema', async (t) => {
  const { db, a, item } = await fixture(t);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
  const details = await repository.getTransactionById(db, item.id);
  assert.equal(details.accountName, a.name);
  assert.equal(details.categoryName, 'Groceries');
  assert.equal(details.merchant, 'Test shop');
  assert.equal(details.note, 'Receipt');
  assert.equal(await repository.getTransactionById(db, 'missing'), null);
  assert.equal(await balance(db, a.id), 7500);
});

test('expense edits apply only the difference, and deletion restores the balance', async (t) => {
  const { db, a, item } = await fixture(t);
  let updated = await edit(db, item, { amountMinor: 4000 });
  assert.equal(await balance(db, a.id), 6000);
  updated = await edit(db, updated, { amountMinor: 1000 });
  assert.equal(await balance(db, a.id), 9000);
  await repository.deleteTransaction(db, item.id, updated.updatedAt);
  assert.equal(await balance(db, a.id), 10000);
  assert.equal(await repository.getTransactionById(db, item.id), null);
});

test('expense/income reclassification and income corrections use the correct signs', async (t) => {
  const { db, a, item } = await fixture(t);
  let updated = await edit(db, item, { type: 'income', categoryId: 'income-salary', amountMinor: 4000 });
  assert.equal(await balance(db, a.id), 14000);
  updated = await edit(db, updated, { amountMinor: 1000 });
  assert.equal(await balance(db, a.id), 11000);
  updated = await edit(db, updated, { type: 'expense', categoryId: null });
  assert.equal(await balance(db, a.id), 9000);
  updated = await edit(db, updated, { type: 'income', categoryId: 'income-salary' });
  await repository.deleteTransaction(db, item.id, updated.updatedAt);
  assert.equal(await balance(db, a.id), 10000);
});

test('moving an expense adjusts both accounts and preserves unrelated activity', async (t) => {
  const { db, a, b, item } = await fixture(t);
  const unrelated = await repository.createTransaction(db, {
    type: 'income', accountId: a.id, categoryId: 'income-salary', amountMinor: 500,
  });
  const updated = await edit(db, item, { accountId: b.id, amountMinor: 4000 });
  assert.equal(await balance(db, a.id), 10500);
  assert.equal(await balance(db, b.id), 16000);
  assert.equal(updated.accountName, b.name);
  await repository.deleteTransaction(db, item.id, updated.updatedAt);
  assert.equal(await balance(db, a.id), 10500);
  assert.equal(await balance(db, b.id), 20000);
  assert.equal((await repository.getTransactionById(db, unrelated.id)).amountMinor, 500);
});

test('moving/reclassifying LBP entries keeps integer units without conversion', async (t) => {
  const { db, a, b, item } = await fixture(t, 'LBP');
  const updated = await edit(db, item, { type: 'income', categoryId: 'income-salary', accountId: b.id, amountMinor: 125001 });
  assert.equal(await balance(db, a.id), 10000);
  assert.equal(await balance(db, b.id), 145001);
  assert.equal(updated.currency, 'LBP');
  await repository.deleteTransaction(db, item.id, updated.updatedAt);
  assert.equal(await balance(db, b.id), 20000);
});

test('metadata edits preserve balances, original dates, currency, and exchange rate', async (t) => {
  const { db, a, item } = await fixture(t);
  const originalAccount = await getAccountById(db, a.id);
  const updated = await edit(db, item, { merchant: '  Corrected shop  ', note: ' ', categoryId: null,
    currency: 'LBP', occurredAt: '2030-01-01', exchangeRateLbpPerUsd: 1 });
  assert.equal(updated.merchant, 'Corrected shop');
  assert.equal(updated.note, null);
  assert.equal(updated.categoryName, null);
  for (const key of ['createdAt', 'occurredAt', 'currency', 'exchangeRateLbpPerUsd']) assert.equal(updated[key], item[key]);
  assert.notEqual(updated.updatedAt, item.updatedAt);
  assert.deepEqual(await getAccountById(db, a.id), originalAccount);
});

test('Home totals, activity, and Reports reflect edits and deletion; transfers stay intact', async (t) => {
  const { db, a, b, item } = await fixture(t);
  const transfer = await createTransfer(db, { sourceAccountId: a.id, destinationAccountId: b.id,
    amountMinor: 1000, occurredAt: '2026-09-02T14:00:00.000Z' });
  const transferBefore = await db.getFirstAsync('SELECT * FROM transfers WHERE id = ?', transfer.id);
  const updated = await edit(db, item, { amountMinor: 4000, categoryId: 'expense-food-dining' });
  const report = await getMonthlyReport(db, '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  assert.equal(report.expenses.usdMinor, 4000);
  assert.equal(report.expenseCategories[0].categoryId, 'expense-food-dining');
  assert.equal((await repository.getExpenseTotalsSince(db, '2026-09-01')).usdMinor, 4000);
  assert.equal((await getRecentActivity(db)).find((entry) => entry.kind === 'transaction').data.amountMinor, 4000);
  await repository.deleteTransaction(db, item.id, updated.updatedAt);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM transfers WHERE id = ?', transfer.id), transferBefore);
  assert.equal((await getRecentActivity(db)).length, 1);
  assert.equal((await getRecentActivity(db))[0].kind, 'transfer');
  assert.equal((await repository.getExpenseTotalsSince(db, '2026-09-01')).usdMinor, 0);
  const afterReport = await getMonthlyReport(db, '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  assert.equal(afterReport.expenses.usdMinor, 0);
  assert.equal(afterReport.expenseCategories.length, 0);
  assert.equal(await balance(db, a.id), 9000);
  assert.equal(await balance(db, b.id), 21000);
});

test('wrong currency, inactive destinations, and invalid categories leave all data unchanged', async (t) => {
  const { db, b, item } = await fixture(t);
  const lbp = await createAccount(db, { name: 'LBP', type: 'cash', currency: 'LBP', openingBalanceMinor: 1 });
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', b.id);
  await db.runAsync("UPDATE categories SET is_active = 0 WHERE id = 'expense-food-dining'");
  const before = await snapshot(db);
  for (const [changes, message] of [
    [{ accountId: lbp.id }, /same currency/], [{ accountId: b.id }, /inactive/],
    [{ accountId: 'missing' }, /Account not found/], [{ categoryId: 'missing' }, /Category not found/],
    [{ categoryId: 'expense-food-dining' }, /inactive/], [{ categoryId: 'income-salary' }, /does not match/],
  ]) {
    await expectValidation(edit(db, item, changes), message);
    assert.deepEqual(await snapshot(db), before);
  }
});

test('historical inactive accounts/categories can be retained, corrected, and deleted', async (t) => {
  const { db, a, item } = await fixture(t);
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', a.id);
  await db.runAsync('UPDATE categories SET is_active = 0 WHERE id = ?', item.categoryId);
  const updated = await edit(db, item, { amountMinor: 3000, note: 'Historical correction' });
  assert.equal(updated.categoryId, item.categoryId);
  assert.equal(await balance(db, a.id), 7000);
  await repository.deleteTransaction(db, item.id, updated.updatedAt);
  assert.equal(await balance(db, a.id), 10000);
  assert.equal((await getAccountById(db, a.id)).isActive, false);
});

test('invalid amounts and types are quiet validation errors with no database mutation', async (t) => {
  const { db, item } = await fixture(t);
  const before = await snapshot(db);
  const spy = t.mock.method(console, 'error', () => {});
  for (const amountMinor of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const error = await edit(db, item, { amountMinor }).catch((value) => value);
    assert.ok(error instanceof ValidationError);
    logUnexpectedError('Failed to edit transaction:', error);
  }
  await expectValidation(edit(db, item, { type: 'transfer' }), /expense or income/);
  assert.equal(spy.mock.callCount(), 0);
  assert.deepEqual(await snapshot(db), before);
});

test('stale edits and deletions cannot overwrite a newer correction', async (t) => {
  const { db, item } = await fixture(t);
  await edit(db, item, { amountMinor: 4000 });
  const before = await snapshot(db);
  await expectValidation(edit(db, item, { amountMinor: 3000 }), /has changed/);
  await expectValidation(repository.deleteTransaction(db, item.id, item.updatedAt), /has changed/);
  await expectValidation(repository.updateTransaction(db, 'missing', editInput(item)), /no longer exists/);
  await expectValidation(repository.deleteTransaction(db, 'missing', item.updatedAt), /no longer exists/);
  assert.deepEqual(await snapshot(db), before);
});

test('simultaneous saves and repeated deletes apply their balance changes once', async (t) => {
  const { db, a, item } = await fixture(t);
  const saved = await Promise.allSettled([edit(db, item, { amountMinor: 4000 }), edit(db, item, { amountMinor: 3000 })]);
  assert.equal(saved.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(saved.find((result) => result.status === 'rejected').reason instanceof ValidationError);
  const current = await repository.getTransactionById(db, item.id);
  assert.equal(await balance(db, a.id), 10000 - current.amountMinor);
  const deleted = await Promise.allSettled([
    repository.deleteTransaction(db, item.id, current.updatedAt),
    repository.deleteTransaction(db, item.id, current.updatedAt),
  ]);
  assert.equal(deleted.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(deleted.find((result) => result.status === 'rejected').reason instanceof ValidationError);
  assert.equal(await balance(db, a.id), 10000);
});

for (const failure of ['destination balance', 'transaction update', 'transaction delete']) {
  test(`${failure} storage failure rolls back every balance and record change`, async (t) => {
    const { db, b, item } = await fixture(t);
    const before = await snapshot(db);
    const trigger = failure === 'destination balance'
      ? `BEFORE UPDATE ON accounts WHEN OLD.id = '${b.id}'`
      : failure === 'transaction update' ? 'BEFORE UPDATE ON transactions' : 'BEFORE DELETE ON transactions';
    await db.execAsync(`CREATE TRIGGER test_failure ${trigger} BEGIN SELECT RAISE(ABORT, 'test storage failure'); END;`);
    const operation = failure === 'transaction delete'
      ? repository.deleteTransaction(db, item.id, item.updatedAt)
      : edit(db, item, { accountId: b.id, amountMinor: 4000 });
    const error = await operation.catch((value) => value);
    assert.ok(error instanceof Error);
    assert.equal(error instanceof ValidationError, false);
    const spy = t.mock.method(console, 'error', () => {});
    logUnexpectedError('Failed to correct transaction:', error);
    assert.equal(spy.mock.callCount(), 1);
    assert.deepEqual(await snapshot(db), before);
  });
}

test('creation rolls back the inserted row if its balance change fails', async (t) => {
  const { db, a } = await fixture(t);
  const before = await snapshot(db);
  await db.execAsync("CREATE TRIGGER test_failure BEFORE UPDATE ON accounts BEGIN SELECT RAISE(ABORT, 'test storage failure'); END;");
  await assert.rejects(repository.createTransaction(db, { type: 'income', accountId: a.id, categoryId: null, amountMinor: 100 }), /test storage failure/);
  assert.deepEqual(await snapshot(db), before);
});

test('balance overflow rejects a move or deletion and rolls back prior changes', async (t) => {
  const { db, a, b, item } = await fixture(t);
  await db.runAsync('UPDATE accounts SET balance_minor = ? WHERE id = ?', -Number.MAX_SAFE_INTEGER, b.id);
  let before = await snapshot(db);
  await expectValidation(edit(db, item, { accountId: b.id }), /supported account balance/);
  assert.deepEqual(await snapshot(db), before);
  await db.runAsync('UPDATE accounts SET balance_minor = ? WHERE id = ?', Number.MAX_SAFE_INTEGER, a.id);
  before = await snapshot(db);
  await expectValidation(repository.deleteTransaction(db, item.id, item.updatedAt), /supported account balance/);
  assert.deepEqual(await snapshot(db), before);
});

test('editing/deleting a recorded recurring occurrence never rewinds its schedule', async (t) => {
  const { db, a } = await fixture(t);
  await db.runAsync(`INSERT INTO recurring_payments
    (id, name, type, account_id, category_id, amount_minor, currency, frequency,
     start_date, next_due_date, created_at, updated_at)
    VALUES ('test-recurring', 'Test bill', 'expense', ?, 'expense-groceries', 500, 'USD',
      'monthly', '2026-09-02', '2026-09-02', '2026-09-02', '2026-09-02')`, a.id);
  const recorded = await recordRecurringPayment(db, 'test-recurring');
  const schedule = await db.getFirstAsync('SELECT * FROM recurring_payments');
  const occurrence = await repository.getTransactionById(db, recorded.transactionId);
  const updated = await edit(db, occurrence, { amountMinor: 1000 });
  await repository.deleteTransaction(db, updated.id, updated.updatedAt);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM recurring_payments'), schedule);
  assert.equal(await balance(db, a.id), 7500);
  assert.equal((await repository.getRecentTransactions(db)).length, 1);
});
