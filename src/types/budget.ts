import type { CurrencyCode } from './account';

export interface MonthlyBudget {
  id: string;
  month: string;
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  currency: CurrencyCode;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  updatedAt: string;
}

export interface SaveMonthlyBudgetInput {
  month: string;
  categoryId: string;
  currency: CurrencyCode;
  limitMinor: number;
  // null means creating, never silently overwrite an existing budget.
  expectedUpdatedAt: string | null;
}
