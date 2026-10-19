import type {
    CurrencyCode,
} from './account';

import type {
    CategoryKind,
} from './category';

export type TransactionType =
  CategoryKind;

export interface Transaction {
  id: string;

  type: TransactionType;

  accountId: string;

  categoryId: string | null;

  amountMinor: number;

  currency: CurrencyCode;

  merchant: string | null;

  note: string | null;

  occurredAt: string;

  exchangeRateLbpPerUsd:
    number | null;

  createdAt: string;

  updatedAt: string;
}

export interface CreateTransactionInput {
  type: TransactionType;

  accountId: string;

  categoryId: string | null;

  amountMinor: number;

  merchant?: string | null;

  note?: string | null;

  occurredAt?: string;

  exchangeRateLbpPerUsd?:
    number | null;
}

// Currency, occurrence date, and the recorded exchange rate remain unchanged.
export interface UpdateTransactionInput {
  expectedUpdatedAt: string;
  type: TransactionType;
  accountId: string;
  categoryId: string | null;
  amountMinor: number;
  merchant: string | null;
  note: string | null;
}

export interface TransactionListItem
  extends Transaction {
  accountName: string;

  categoryName: string | null;

  categoryIcon: string | null;
}
