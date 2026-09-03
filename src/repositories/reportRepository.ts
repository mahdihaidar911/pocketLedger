import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CategoryTotal,
  MonthlyReport,
  ReportCurrencyTotals,
} from '../types';

type SummaryRow = {
  type: string;
  currency: string;
  amount_minor: number;
};

type CategoryRow = {
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  usd_minor: number;
  lbp_minor: number;
};

const emptyTotals = (): ReportCurrencyTotals => ({
  usdMinor: 0,
  lbpMinor: 0,
});

export interface ReportOptions {
  /** ISO datetime string for the start of the range (inclusive). */
  startIso: string;
  /** ISO datetime string for the end of the range (exclusive). */
  endIso: string;
  /**
   * Filter to a specific account. When omitted (or null), all accounts
   * are included.
   */
  accountId?: string | null;
  /**
   * Current LBP-per-USD exchange rate used to compute USD-equivalent totals.
   * When omitted, USD-equivalent fields are null.
   */
  exchangeRateLbpPerUsd?: number | null;
}

export async function getMonthlyReport(
  db: SQLiteDatabase,
  startIso: string,
  endIso: string,
  accountId?: string | null,
  exchangeRateLbpPerUsd?: number | null
): Promise<MonthlyReport> {
  if (
    !Number.isFinite(Date.parse(startIso)) ||
    !Number.isFinite(Date.parse(endIso)) ||
    startIso >= endIso
  ) {
    throw new Error('Invalid report date range.');
  }

  // Build optional account filter clause.
  const accountFilter = accountId ? 'AND t.account_id = ?' : '';
  const accountArgs = accountId ? [accountId] : [];

  const [summaryRows, expenseCategoryRows, incomeCategoryRows] = await Promise.all([
    // Summary totals by type and currency
    db.getAllAsync<SummaryRow>(
      `
        SELECT
          type,
          currency,
          SUM(amount_minor) AS amount_minor
        FROM transactions t
        WHERE
          occurred_at >= ?
          AND occurred_at < ?
          ${accountId ? 'AND account_id = ?' : ''}
        GROUP BY type, currency
      `,
      startIso,
      endIso,
      ...accountArgs
    ),

    // Expense breakdown by category
    db.getAllAsync<CategoryRow>(
      `
        SELECT
          t.category_id,
          COALESCE(c.name, 'Uncategorized') AS category_name,
          c.icon AS category_icon,
          COALESCE(SUM(
            CASE WHEN t.currency = 'USD' THEN t.amount_minor ELSE 0 END
          ), 0) AS usd_minor,
          COALESCE(SUM(
            CASE WHEN t.currency = 'LBP' THEN t.amount_minor ELSE 0 END
          ), 0) AS lbp_minor
        FROM transactions t
        LEFT JOIN categories c
          ON c.id = t.category_id
        WHERE
          t.type = 'expense'
          AND t.occurred_at >= ?
          AND t.occurred_at < ?
          ${accountFilter}
        GROUP BY
          t.category_id,
          c.name,
          c.icon
        ORDER BY
          usd_minor DESC,
          lbp_minor DESC,
          category_name ASC
      `,
      startIso,
      endIso,
      ...accountArgs
    ),

    // Income breakdown by category
    db.getAllAsync<CategoryRow>(
      `
        SELECT
          t.category_id,
          COALESCE(c.name, 'Uncategorized') AS category_name,
          c.icon AS category_icon,
          COALESCE(SUM(
            CASE WHEN t.currency = 'USD' THEN t.amount_minor ELSE 0 END
          ), 0) AS usd_minor,
          COALESCE(SUM(
            CASE WHEN t.currency = 'LBP' THEN t.amount_minor ELSE 0 END
          ), 0) AS lbp_minor
        FROM transactions t
        LEFT JOIN categories c
          ON c.id = t.category_id
        WHERE
          t.type = 'income'
          AND t.occurred_at >= ?
          AND t.occurred_at < ?
          ${accountFilter}
        GROUP BY
          t.category_id,
          c.name,
          c.icon
        ORDER BY
          usd_minor DESC,
          lbp_minor DESC,
          category_name ASC
      `,
      startIso,
      endIso,
      ...accountArgs
    ),
  ]);

  const income = emptyTotals();
  const expenses = emptyTotals();

  for (const row of summaryRows) {
    const target = row.type === 'income' ? income : expenses;
    if (row.currency === 'USD') {
      target.usdMinor = row.amount_minor;
    } else if (row.currency === 'LBP') {
      target.lbpMinor = row.amount_minor;
    }
  }

  function mapCategoryRow(row: CategoryRow): CategoryTotal {
    return {
      categoryId: row.category_id,
      categoryName: row.category_name ?? 'Uncategorized',
      categoryIcon: row.category_icon,
      usdMinor: row.usd_minor,
      lbpMinor: row.lbp_minor,
    };
  }

  // Compute USD-equivalent totals when an exchange rate is available.
  // Formula: usd_minor + round(lbp_minor / rate)
  let totalExpensesUsdEquivalentMinor: number | null = null;
  let totalIncomeUsdEquivalentMinor: number | null = null;

  const rate = exchangeRateLbpPerUsd;
  if (rate && Number.isFinite(rate) && rate > 0) {
    totalExpensesUsdEquivalentMinor =
      expenses.usdMinor + Math.round(expenses.lbpMinor / rate);
    totalIncomeUsdEquivalentMinor =
      income.usdMinor + Math.round(income.lbpMinor / rate);
  }

  return {
    income,
    expenses,
    net: {
      usdMinor: income.usdMinor - expenses.usdMinor,
      lbpMinor: income.lbpMinor - expenses.lbpMinor,
    },
    expenseCategories: expenseCategoryRows.map(mapCategoryRow),
    incomeCategories: incomeCategoryRows.map(mapCategoryRow),
    totalExpensesUsdEquivalentMinor,
    totalIncomeUsdEquivalentMinor,
  };
}
