import type {
    CurrencyCode,
} from './account';

export interface SavingsGoal {
  id: string;

  name: string;

  accountId: string;

  targetAmountMinor: number;

  currency: CurrencyCode;

  targetDate: string | null;

  icon: string | null;

  isCompleted: boolean;

  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalListItem
  extends SavingsGoal {
  currentAmountMinor: number;

  accountName: string;
}

export interface CreateSavingsGoalInput {
  name: string;

  targetAmountMinor: number;

  currency: CurrencyCode;

  targetDate?: string | null;

  icon?: string | null;
}
export interface UpdateSavingsGoalInput {
  id: string;

  name: string;

  targetAmountMinor: number;

  targetDate?: string | null;
}