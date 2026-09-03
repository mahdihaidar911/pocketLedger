export interface ReportCurrencyTotals {
  usdMinor: number;
  lbpMinor: number;
}

export interface CategoryTotal {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string | null;
  usdMinor: number;
  lbpMinor: number;
}

/** @deprecated Use CategoryTotal */
export type CategoryExpenseTotal = CategoryTotal;

export interface MonthlyReport {
  income: ReportCurrencyTotals;
  expenses: ReportCurrencyTotals;
  net: ReportCurrencyTotals;
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  /**
   * USD-equivalent total of all expenses, combining USD expenses with
   * LBP expenses converted at the current exchange rate.
   * Null when no exchange rate is configured.
   */
  totalExpensesUsdEquivalentMinor: number | null;
  totalIncomeUsdEquivalentMinor: number | null;
}
