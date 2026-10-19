import type { CurrencyCode } from './account';

export interface Transfer {
  id: string;

  sourceAccountId: string;
  destinationAccountId: string;

  sourceAmountMinor: number;
  destinationAmountMinor: number;

  sourceCurrency: CurrencyCode;
  destinationCurrency: CurrencyCode;

  exchangeRateLbpPerUsd: number | null;

  note: string | null;

  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferInput {
  sourceAccountId: string;
  destinationAccountId: string;

  amountMinor: number;

  note?: string | null;
  occurredAt?: string;
}

export interface TransferListItem
  extends Transfer {
  sourceAccountName: string;

  destinationAccountName: string;
}