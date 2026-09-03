const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, setup } = require('./helpers/database.cjs');
const { getMonthlyBudgets, saveMonthlyBudget, deleteMonthlyBudget } = loadSource('src/repositories/budgetRepository.ts');
const { createAccount } = loadSource('src/repositories/accountRepository.ts');
const { createTransaction, updateTransaction, getTransactionById, deleteTransaction } = loadSource('src/repositories/transactionRepository.ts');
const { createTransfer } = loadSource('src/repositories/transferRepository.ts');
const { createRecurringPayment, recordRecurringPayment } = loadSource('src/repositories/recurringPaymentRepository.ts');
const { currentBudgetMonth } = loadSource('src/utils/budgetMonths.ts');
const { getTodayDateOnly } = loadSource('src/utils/recurring.ts');
const { migrateDatabase } = loadSource('src/database/migrate.ts');
const { budgetMonthPeriod, shiftBudgetMonth } = loadSource('src/utils/budgetMonths.ts');
const { ValidationError } = loadSource('src/utils/errors.ts');

const input = (changes = {}) => ({ month: '2026-09', categoryId: 'expense-groceries', currency: 'USD', limitMinor: 10000, expectedUpdatedAt: null, ...changes });
function timeZone(t, zone) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
}
async function fixture(t) {
  timeZone(t, 'Asia/Beirut');
  const { db } = await setup(t);
  const usd = await createAccount(db, { name: 'USD wallet', type: 'cash', currency: 'USD', openingBalanceMinor: 100000 });
  const lbp = await createAccount(db, { name: 'LBP wallet', type: 'cash', currency: 'LBP', openingBalanceMinor: 1000000 });
  const expense = (changes = {}) => createTransaction(db, { type: 'expense', accountId: usd.id, categoryId: 'expense-groceries', amountMinor: 2500, occurredAt: '2026-09-02T12:00:00.000Z', ...changes });
  return { db, usd, lbp, expense };
}
async function financialSnapshot(db) {
  const tables = ['accounts', 'categories', 'transactions', 'transfers', 'savings_goals', 'recurring_payments', 'exchange_rates', 'app_settings'];
  return Promise.all(tables.map((name) => db.getAllAsync(`SELECT * FROM ${name} ORDER BY 1`)));
}

test('V8 upgrade adds budgets without altering existing records and is repeatable', async (t) => {
  const { db, expense } = await fixture(t);
  await expense();
  const before = await financialSnapshot(db);
  // Only this disposable in-memory database is changed to reproduce V8.
  await db.execAsync('DROP TABLE monthly_budgets; PRAGMA user_version = 8;');
  await migrateDatabase(db);
  await saveMonthlyBudget(db, input());
  await migrateDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
  assert.equal((await getMonthlyBudgets(db, '2026-09')).length, 1);
  assert.deepEqual(await financialSnapshot(db), before);
});

test('failed V9 upgrade rolls back both the new table and version', async (t) => {
  const { db } = await fixture(t);
  await db.execAsync('DROP TABLE monthly_budgets; PRAGMA user_version = 8;');
  const original = db.withExclusiveTransactionAsync.bind(db);
  const mock = t.mock.method(db, 'withExclusiveTransactionAsync', (action) => original(async (txn) => {
    await action(txn); throw new Error('Simulated upgrade interruption');
  }));
  await assert.rejects(migrateDatabase(db), /upgrade interruption/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'monthly_budgets'"), null);
  mock.mock.restore();
  await migrateDatabase(db);
  assert.deepEqual(await getMonthlyBudgets(db, '2026-09'), []);
});

test('budgets count expenses only and keep categories, currencies, and months separate', async (t) => {
  const { db, usd, lbp, expense } = await fixture(t);
  await saveMonthlyBudget(db, input());
  await saveMonthlyBudget(db, input({ currency: 'LBP', limitMinor: 500000 }));
  await saveMonthlyBudget(db, input({ month: '2026-08', limitMinor: 20000 }));
  await expense();
  await expense({ accountId: lbp.id, amountMinor: 100001 });
  await expense({ categoryId: 'expense-fuel', amountMinor: 3000 });
  await expense({ type: 'income', categoryId: 'income-salary', amountMinor: 6000 });
  await expense({ categoryId: null, amountMinor: 2000 });
  await expense({ occurredAt: '2026-08-01T12:00:00.000Z', amountMinor: 1500 });
  const bank = await createAccount(db, { name: 'Bank', type: 'bank', currency: 'USD', openingBalanceMinor: 0 });
  await createTransfer(db, { sourceAccountId: usd.id, destinationAccountId: bank.id, amountMinor: 1000, occurredAt: '2026-09-02T12:00:00.000Z' });
  const rows = await getMonthlyBudgets(db, '2026-09');
  assert.equal(rows.find((row) => row.currency === 'USD').spentMinor, 2500);
  assert.equal(rows.find((row) => row.currency === 'USD').remainingMinor, 7500);
  assert.equal(rows.find((row) => row.currency === 'LBP').spentMinor, 100001);
  assert.equal((await getMonthlyBudgets(db, '2026-08'))[0].spentMinor, 1500);
  assert.deepEqual(await getMonthlyBudgets(db, '2026-10'), []);
});

test('local month boundaries include the first instant and exclude the next month', async (t) => {
  const { db, expense } = await fixture(t);
  const { startIso, endIso } = budgetMonthPeriod('2026-09');
  assert.equal(startIso, '2026-08-31T21:00:00.000Z');
  await saveMonthlyBudget(db, input());
  await expense({ occurredAt: new Date(Date.parse(startIso) - 1).toISOString() });
  await expense({ occurredAt: startIso });
  await expense({ occurredAt: new Date(Date.parse(endIso) - 1).toISOString() });
  await expense({ occurredAt: endIso });
  assert.equal((await getMonthlyBudgets(db, '2026-09'))[0].spentMinor, 5000);
});

test('unrecorded recurring items do not consume a budget; recording an expense does', async (t) => {
  const { db, usd } = await fixture(t);
  const month = currentBudgetMonth();
  await saveMonthlyBudget(db, input({ month }));
  const recurring = await createRecurringPayment(db, { name: 'Test groceries', type: 'expense', accountId: usd.id,
    categoryId: 'expense-groceries', amountMinor: 3500, frequency: 'monthly', startDate: getTodayDateOnly() });
  assert.equal((await getMonthlyBudgets(db, month))[0].spentMinor, 0);
  await recordRecurringPayment(db, recurring.id);
  assert.equal((await getMonthlyBudgets(db, month))[0].spentMinor, 3500);
});

test('month helpers handle leap years, daylight-saving changes, and year rollover', (t) => {
  timeZone(t, 'America/New_York');
  const march = budgetMonthPeriod('2026-03');
  assert.equal(march.startIso, '2026-03-01T05:00:00.000Z');
  assert.equal(march.endIso, '2026-04-01T04:00:00.000Z');
  assert.equal((Date.parse(budgetMonthPeriod('2024-02').endIso) - Date.parse(budgetMonthPeriod('2024-02').startIso)) / 86400000, 29);
  assert.equal(shiftBudgetMonth('2026-12', 1), '2027-01');
  assert.equal(shiftBudgetMonth('2026-01', -1), '2025-12');
  for (const month of ['', '2026-1', '2026-13', '0000-01', '2026-09-01', "2026-09' OR 1=1"]) assert.throws(() => budgetMonthPeriod(month), ValidationError);
});

test('expense corrections, recategorization, and deletion immediately update progress', async (t) => {
  const { db, expense } = await fixture(t);
  await saveMonthlyBudget(db, input());
  let item = await expense();
  const update = async (changes) => {
    await updateTransaction(db, item.id, { expectedUpdatedAt: item.updatedAt, type: item.type, accountId: item.accountId,
      categoryId: item.categoryId, amountMinor: item.amountMinor, ...changes });
    item = await getTransactionById(db, item.id);
  };
  await update({ amountMinor: 12000 });
  assert.equal((await getMonthlyBudgets(db, '2026-09'))[0].remainingMinor, -2000);
  await update({ categoryId: 'expense-fuel' });
  assert.equal((await getMonthlyBudgets(db, '2026-09'))[0].spentMinor, 0);
  await update({ categoryId: 'expense-groceries', amountMinor: 10000 });
  assert.equal((await getMonthlyBudgets(db, '2026-09'))[0].remainingMinor, 0);
  await deleteTransaction(db, item.id, item.updatedAt);
  assert.equal((await getMonthlyBudgets(db, '2026-09'))[0].spentMinor, 0);
});

test('save, edit, and removal affect only the selected limit, never financial records', async (t) => {
  const { db, expense } = await fixture(t);
  await expense();
  const before = await financialSnapshot(db);
  await saveMonthlyBudget(db, input());
  let [row] = await getMonthlyBudgets(db, '2026-09');
  await saveMonthlyBudget(db, input({ expectedUpdatedAt: row.updatedAt, limitMinor: 5000 }));
  [row] = await getMonthlyBudgets(db, '2026-09');
  assert.equal(row.limitMinor, 5000);
  await deleteMonthlyBudget(db, row.id, row.updatedAt);
  assert.deepEqual(await getMonthlyBudgets(db, '2026-09'), []);
  assert.deepEqual(await financialSnapshot(db), before);
});

test('duplicate, concurrent, and stale saves cannot overwrite a newer limit', async (t) => {
  const { db } = await fixture(t);
  const created = await Promise.allSettled([saveMonthlyBudget(db, input()), saveMonthlyBudget(db, input())]);
  assert.equal(created.filter((value) => value.status === 'fulfilled').length, 1);
  const [original] = await getMonthlyBudgets(db, '2026-09');
  await saveMonthlyBudget(db, input({ expectedUpdatedAt: original.updatedAt, limitMinor: 11000 }));
  await assert.rejects(saveMonthlyBudget(db, input({ expectedUpdatedAt: original.updatedAt, limitMinor: 2000 })), ValidationError);
  await assert.rejects(deleteMonthlyBudget(db, original.id, original.updatedAt), ValidationError);
  const [current] = await getMonthlyBudgets(db, '2026-09');
  assert.equal(current.limitMinor, 11000);
  await deleteMonthlyBudget(db, current.id, current.updatedAt);
  await assert.rejects(saveMonthlyBudget(db, input({ expectedUpdatedAt: current.updatedAt })), ValidationError);
});

test('inactive account/category history stays counted; new inactive-category budgets are rejected', async (t) => {
  const { db, usd, expense } = await fixture(t);
  await expense(); await saveMonthlyBudget(db, input());
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', usd.id);
  await db.execAsync("UPDATE categories SET is_active = 0, name = 'Renamed groceries' WHERE id = 'expense-groceries'");
  const [row] = await getMonthlyBudgets(db, '2026-09');
  assert.equal(row.spentMinor, 2500); assert.equal(row.categoryName, 'Renamed groceries'); assert.equal(row.categoryActive, false);
  await saveMonthlyBudget(db, input({ expectedUpdatedAt: row.updatedAt, limitMinor: 20000 }));
  await assert.rejects(saveMonthlyBudget(db, input({ month: '2026-10' })), ValidationError);
});

test('invalid limits, currencies, months, and categories fail without writes', async (t) => {
  const { db } = await fixture(t);
  for (const changes of [{ limitMinor: 0 }, { limitMinor: -1 }, { limitMinor: 1.5 }, { limitMinor: Number.MAX_SAFE_INTEGER + 1 },
    { currency: 'EUR' }, { month: '2026-13' }, { categoryId: 'missing' }, { categoryId: 'income-salary' }]) {
    await assert.rejects(saveMonthlyBudget(db, input(changes)), ValidationError);
  }
  assert.deepEqual(await getMonthlyBudgets(db, '2026-09'), []);
});

test('database constraints and failed writes preserve previous budgets', async (t) => {
  const { db } = await fixture(t);
  await saveMonthlyBudget(db, input());
  const [before] = await getMonthlyBudgets(db, '2026-09');
  await assert.rejects(db.runAsync('UPDATE monthly_budgets SET limit_minor = 1.5 WHERE id = ?', before.id), /CHECK/);
  await assert.rejects(db.runAsync("UPDATE monthly_budgets SET month = '2026-13' WHERE id = ?", before.id), /CHECK/);
  await db.execAsync("CREATE TRIGGER fail_budget BEFORE UPDATE ON monthly_budgets BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  await assert.rejects(saveMonthlyBudget(db, input({ expectedUpdatedAt: before.updatedAt, limitMinor: 5000 })), /simulated failure/);
  assert.deepEqual((await getMonthlyBudgets(db, '2026-09'))[0], before);
});
