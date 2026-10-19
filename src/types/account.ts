export type CurrencyCode = 'USD' | 'LBP';

export type AccountType =
  | 'cash'
  | 'whish'
  | 'bank'
  | 'savings'
  | 'other';

export interface Account {
  id: string;

  name: string;

  type: AccountType;

  currency: CurrencyCode;

  balanceMinor: number;

  lowBalanceThresholdMinor: number | null;

  icon: string | null;

  isActive: boolean;

  createdAt: string;

  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;

  type: AccountType;

  currency: CurrencyCode;

  openingBalanceMinor: number;

  lowBalanceThresholdMinor?: number | null;

  icon?: string | null;
}