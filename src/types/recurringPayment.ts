import type {
    CurrencyCode,
} from './account';

import type {
    TransactionType,
} from './transaction';

export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly';

export interface RecurringPayment {
  id: string;

  name: string;

  type: TransactionType;

  accountId: string;

  categoryId: string | null;

  amountMinor: number;

  currency: CurrencyCode;

  frequency: RecurringFrequency;

  intervalCount: number;

  startDate: string;

  nextDueDate: string;

  endDate: string | null;

  merchant: string | null;

  note: string | null;

  isActive: boolean;

  createdAt: string;

  updatedAt: string;
}

export interface RecurringPaymentListItem
  extends RecurringPayment {
  accountName: string;

  categoryName: string | null;

  categoryIcon: string | null;
}

export interface CreateRecurringPaymentInput {
  name: string;

  type: TransactionType;

  accountId: string;

  categoryId?: string | null;

  amountMinor: number;

  frequency: RecurringFrequency;

  intervalCount?: number;

  startDate: string;

  merchant?: string | null;

  note?: string | null;
}

export interface UpdateRecurringPaymentInput {
  name: string;

  type: TransactionType;

  accountId: string;

  categoryId?: string | null;

  amountMinor: number;

  frequency: RecurringFrequency;

  intervalCount?: number;

  nextDueDate: string;

  merchant?: string | null;

  note?: string | null;
}
