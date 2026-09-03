const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, setup } = require('./helpers/database.cjs');

const repository = loadSource('src/repositories/categoryRepository.ts');
const { migrateDatabase } = loadSource('src/database/migrate.ts');
const { getMonthlyReport } = loadSource('src/repositories/reportRepository.ts');
const { ValidationError, logUnexpectedError } = loadSource('src/utils/errors.ts');

async function addLinkedRecords(db, categoryId) {
  await db.runAsync(`INSERT INTO accounts
    (id, name, type, currency, balance_minor, created_at, updated_at)
    VALUES ('test-account', 'Test wallet', 'cash', 'USD', 12345, '2026-09-01', '2026-09-01')`);
  await db.runAsync(`INSERT INTO transactions
    (id, type, account_id, category_id, amount_minor, currency, occurred_at, created_at, updated_at)
    VALUES ('test-transaction', 'expense', 'test-account', ?, 500, 'USD',
      '2026-09-02T12:00:00.000Z', '2026-09-02', '2026-09-02')`, categoryId);
  await db.runAsync(`INSERT INTO recurring_payments
    (id, name, type, account_id, category_id, amount_minor, currency, frequency,
     start_date, next_due_date, created_at, updated_at)
    VALUES ('test-recurring', 'Test bill', 'expense', 'test-account', ?, 500, 'USD',
      'monthly', '2026-09-02', '2026-10-02', '2026-09-02', '2026-09-02')`, categoryId);
}

function expectValidation(promise, message) {
  return assert.rejects(promise, (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, message);
    return true;
  });
}

test('category changes preserve the migrated schema', async (t) => {
  const { db } = await setup(t);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
  const item = await repository.createCategory(db, { name: '  Pets  ', kind: 'expense', icon: 'heart-outline' });
  assert.equal(item.name, 'Pets');
  assert.equal(item.isDefault, false);
  assert.equal(item.isActive, true);
  assert.deepEqual(await repository.getCategoryById(db, item.id), item);
});

test('renaming preserves transaction amounts, balances, and recurring links', async (t) => {
  const { db } = await setup(t);
  const item = await repository.createCategory(db, { name: 'Pets', kind: 'expense', icon: 'heart-outline' });
  await addLinkedRecords(db, item.id);
  const beforeTransaction = await db.getFirstAsync('SELECT * FROM transactions');
  const beforeRecurring = await db.getFirstAsync('SELECT * FROM recurring_payments');
  const beforeAccount = await db.getFirstAsync('SELECT * FROM accounts');

  await repository.updateCategory(db, item.id, {
    name: '  Pet Care  ', icon: 'home-outline', kind: 'income',
  });
  const updated = await repository.getCategoryById(db, item.id);
  assert.equal(updated.name, 'Pet Care');
  assert.equal(updated.icon, 'home-outline');
  assert.equal(updated.kind, item.kind);
  assert.equal(updated.createdAt, item.createdAt);
  assert.equal(updated.isActive, item.isActive);
  assert.equal(updated.isDefault, item.isDefault);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM transactions'), beforeTransaction);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM recurring_payments'), beforeRecurring);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM accounts'), beforeAccount);
  const report = await getMonthlyReport(db, '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  assert.equal(report.expenseCategories[0].categoryName, 'Pet Care');
  assert.equal(report.expenses.usdMinor, 500);
});

test('duplicate creates and renames are expected validation errors, including inactive names', async (t) => {
  const { db } = await setup(t);
  const item = await repository.createCategory(db, { name: 'Pets', kind: 'expense' });
  const second = await repository.createCategory(db, { name: 'Hobbies', kind: 'expense' });
  await expectValidation(repository.createCategory(db, { name: ' pets ', kind: 'expense' }), /already exists/);
  await expectValidation(repository.updateCategory(db, second.id, { name: 'PETS', icon: null }), /already exists/);
  await repository.setCategoryActive(db, item.id, false);
  await expectValidation(repository.createCategory(db, { name: 'pets', kind: 'expense' }), /inactive category/);
  await expectValidation(repository.updateCategory(db, second.id, { name: 'pets', icon: null }), /inactive category/);
  assert.equal((await repository.getCategoryById(db, second.id)).name, 'Hobbies');
  await repository.createCategory(db, { name: 'Pets', kind: 'income' });
});

test('simultaneous case-variant creates cannot bypass duplicate validation', async (t) => {
  const { db } = await setup(t);
  const results = await Promise.allSettled([
    repository.createCategory(db, { name: 'Pets', kind: 'expense' }),
    repository.createCategory(db, { name: 'PETS', kind: 'expense' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(results.find((result) => result.status === 'rejected').reason instanceof ValidationError);
});

test('an unchanged name, null icon, and inactive/default flags survive an edit', async (t) => {
  const { db } = await setup(t);
  const original = await repository.getCategoryById(db, 'income-salary');
  await repository.setCategoryActive(db, original.id, false);
  await repository.updateCategory(db, original.id, { name: original.name, icon: null });
  const updated = await repository.getCategoryById(db, original.id);
  assert.equal(updated.icon, null);
  assert.equal(updated.isDefault, true);
  assert.equal(updated.isActive, false);
  assert.equal(updated.kind, 'income');
  await migrateDatabase(db);
  assert.deepEqual(await repository.getCategoryById(db, original.id), updated);
});

test('blank/long names and missing categories are handled validation errors', async (t) => {
  const { db } = await setup(t);
  for (const name of [' ', 'x'.repeat(41)]) {
    await expectValidation(repository.createCategory(db, { name, kind: 'expense' }), /Category name/);
    await expectValidation(repository.updateCategory(db, 'income-salary', { name, icon: null }), /Category name/);
  }
  assert.equal(await repository.getCategoryById(db, 'missing'), null);
  await expectValidation(repository.updateCategory(db, 'missing', { name: 'Valid', icon: null }), /not found/);
  await expectValidation(repository.setCategoryActive(db, 'missing', false), /not found/);
});

test('active recurring protection rolls back and emits no error log', async (t) => {
  const { db } = await setup(t);
  const item = await repository.createCategory(db, { name: 'Pets', kind: 'expense' });
  await addLinkedRecords(db, item.id);
  const spy = t.mock.method(console, 'error', () => {});
  const error = await repository.setCategoryActive(db, item.id, false).catch((value) => value);
  assert.ok(error instanceof ValidationError);
  assert.match(error.message, /active recurring payment/);
  logUnexpectedError('Failed to change category status:', error);
  assert.equal(spy.mock.callCount(), 0);
  assert.equal((await repository.getCategoryById(db, item.id)).isActive, true);
});

test('deactivation/reactivation preserves history and affects only active pickers', async (t) => {
  const { db } = await setup(t);
  const item = await repository.createCategory(db, { name: 'Pets', kind: 'expense' });
  await addLinkedRecords(db, item.id);
  await db.runAsync('UPDATE recurring_payments SET is_active = 0');
  await repository.setCategoryActive(db, item.id, false);
  assert.equal((await repository.getCategories(db, 'expense')).some((value) => value.id === item.id), false);
  assert.equal((await repository.getAllCategories(db, 'expense')).some((value) => value.id === item.id), true);
  assert.equal((await db.getFirstAsync('SELECT category_id FROM transactions')).category_id, item.id);
  await repository.setCategoryActive(db, item.id, true);
  assert.equal((await repository.getCategories(db, 'expense')).some((value) => value.id === item.id), true);
});

test('last-active-category protection is a quiet validation error', async (t) => {
  const { db } = await setup(t);
  await db.runAsync("UPDATE categories SET is_active = 0 WHERE kind = 'income' AND id <> 'income-salary'");
  const spy = t.mock.method(console, 'error', () => {});
  const error = await repository.setCategoryActive(db, 'income-salary', false).catch((value) => value);
  assert.ok(error instanceof ValidationError);
  assert.match(error.message, /at least one active/);
  logUnexpectedError('Failed to change category status:', error);
  assert.equal(spy.mock.callCount(), 0);
  assert.equal((await repository.getCategoryById(db, 'income-salary')).isActive, true);
});

test('unexpected SQLite errors still log and updates roll back', async (t) => {
  const { db } = await setup(t);
  const original = await repository.getCategoryById(db, 'income-salary');
  await db.execAsync(`CREATE TRIGGER fail_category_update BEFORE UPDATE ON categories
    BEGIN SELECT RAISE(ABORT, 'test storage failure'); END;`);
  const error = await repository.updateCategory(db, original.id, { name: 'Wages', icon: null }).catch((value) => value);
  assert.ok(error instanceof Error);
  assert.equal(error instanceof ValidationError, false);
  const spy = t.mock.method(console, 'error', () => {});
  logUnexpectedError('Failed to save category:', error);
  assert.equal(spy.mock.callCount(), 1);
  assert.deepEqual(await repository.getCategoryById(db, original.id), original);
});
