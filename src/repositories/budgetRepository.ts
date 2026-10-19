import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { MonthlyBudget, SaveMonthlyBudgetInput } from '../types/budget';
import { budgetMonthPeriod } from '../utils/budgetMonths';
import { ValidationError } from '../utils/errors';

type BudgetRow = {
  id: string; month: string; category_id: string; category_name: string;
  category_active: number; currency: MonthlyBudget['currency']; limit_minor: number;
  spent_minor: number; updated_at: string;
};

export async function getMonthlyBudgets(db: SQLiteDatabase, month: string): Promise<MonthlyBudget[]> {
  const { startIso, endIso } = budgetMonthPeriod(month);
  const rows = await db.getAllAsync<BudgetRow>(`
    SELECT b.*, c.name AS category_name, c.is_active AS category_active,
      COALESCE((SELECT SUM(t.amount_minor) FROM transactions t
        WHERE t.type = 'expense' AND t.category_id = b.category_id
          AND t.currency = b.currency AND t.occurred_at >= ? AND t.occurred_at < ?
      ), 0) AS spent_minor
    FROM monthly_budgets b JOIN categories c ON c.id = b.category_id
    WHERE b.month = ? ORDER BY c.name COLLATE NOCASE, b.currency
  `, startIso, endIso, month);
  return rows.map((row) => {
    if (!Number.isSafeInteger(row.spent_minor) || row.spent_minor < 0 ||
        !Number.isSafeInteger(row.limit_minor) || row.limit_minor <= 0) {
      throw new Error('Budget amounts exceed the supported range.');
    }
    return {
      id: row.id, month: row.month, categoryId: row.category_id,
      categoryName: row.category_name, categoryActive: row.category_active === 1,
      currency: row.currency, limitMinor: row.limit_minor, spentMinor: row.spent_minor,
      remainingMinor: row.limit_minor - row.spent_minor, updatedAt: row.updated_at,
    };
  });
}

export async function saveMonthlyBudget(db: SQLiteDatabase, input: SaveMonthlyBudgetInput): Promise<void> {
  budgetMonthPeriod(input.month);
  if (input.currency !== 'USD' && input.currency !== 'LBP') throw new ValidationError('Choose USD or LBP.');
  if (!Number.isSafeInteger(input.limitMinor) || input.limitMinor <= 0) {
    throw new ValidationError('Enter a budget greater than zero.');
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string; updated_at: string }>(`
      SELECT id, updated_at FROM monthly_budgets WHERE month = ? AND category_id = ? AND currency = ?
    `, input.month, input.categoryId, input.currency);
    if (existing && input.expectedUpdatedAt === null) {
      throw new ValidationError('A budget already exists for this category, currency, and month. Edit that budget instead.');
    }
    if ((existing?.updated_at ?? null) !== input.expectedUpdatedAt) {
      throw new ValidationError('This budget changed or was removed. Go back and reopen it.');
    }
    const category = await txn.getFirstAsync<{ kind: string; is_active: number }>(
      'SELECT kind, is_active FROM categories WHERE id = ?', input.categoryId
    );
    if (!category || category.kind !== 'expense') throw new ValidationError('Choose an expense category.');
    if (!existing && category.is_active !== 1) throw new ValidationError('Choose an active expense category.');
    const now = new Date(Math.max(Date.now(), existing ? Date.parse(existing.updated_at) + 1 : 0)).toISOString();
    if (existing) {
      await txn.runAsync('UPDATE monthly_budgets SET limit_minor = ?, updated_at = ? WHERE id = ?', input.limitMinor, now, existing.id);
    } else {
      await txn.runAsync(`INSERT INTO monthly_budgets
        (id, month, category_id, currency, limit_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(), input.month, input.categoryId, input.currency, input.limitMinor, now, now);
    }
  });
}

export async function deleteMonthlyBudget(db: SQLiteDatabase, id: string, expectedUpdatedAt: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync('DELETE FROM monthly_budgets WHERE id = ? AND updated_at = ?', id, expectedUpdatedAt);
    if (result.changes !== 1) throw new ValidationError('This budget changed or was removed. Go back and reopen it.');
  });
}
