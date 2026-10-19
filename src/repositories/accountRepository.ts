import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  Account,
  AccountType,
  CreateAccountInput,
  CurrencyCode,
} from '../types';

type AccountRow = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance_minor: number;
  low_balance_threshold_minor: number | null;
  icon: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    currency: row.currency as CurrencyCode,
    balanceMinor: row.balance_minor,
    lowBalanceThresholdMinor: row.low_balance_threshold_minor,
    icon: row.icon,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAccounts(
  db: SQLiteDatabase
): Promise<Account[]> {
  const rows = await db.getAllAsync<AccountRow>(
    `
      SELECT
        id,
        name,
        type,
        currency,
        balance_minor,
        low_balance_threshold_minor,
        icon,
        is_active,
        created_at,
        updated_at
      FROM accounts
      WHERE is_active = 1
      ORDER BY created_at ASC
    `
  );

  return rows.map(mapAccountRow);
}
export async function getAccountById(
  db: SQLiteDatabase,
  id: string
): Promise<Account | null> {
  const row = await db.getFirstAsync<AccountRow>(
    `
      SELECT
        id,
        name,
        type,
        currency,
        balance_minor,
        low_balance_threshold_minor,
        icon,
        is_active,
        created_at,
        updated_at
      FROM accounts
      WHERE id = ?
      LIMIT 1
    `,
    id
  );

  if (!row) {
    return null;
  }

  return mapAccountRow(row);
}

export async function createAccount(
  db: SQLiteDatabase,
  input: CreateAccountInput
): Promise<Account> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO accounts (
        id,
        name,
        type,
        currency,
        balance_minor,
        low_balance_threshold_minor,
        icon,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `,
    id,
    input.name.trim(),
    input.type,
    input.currency,
    input.openingBalanceMinor,
    input.lowBalanceThresholdMinor ?? null,
    input.icon ?? null,
    now,
    now
  );

  return {
    id,
    name: input.name.trim(),
    type: input.type,
    currency: input.currency,
    balanceMinor: input.openingBalanceMinor,
    lowBalanceThresholdMinor:
      input.lowBalanceThresholdMinor ?? null,
    icon: input.icon ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}
export async function updateAccountDetails(
  db: SQLiteDatabase,
  input: {
    id: string;
    name: string;
    type: AccountType;
    lowBalanceThresholdMinor: number | null;
  }
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE accounts
      SET
        name = ?,
        type = ?,
        low_balance_threshold_minor = ?,
        updated_at = ?
      WHERE id = ?
    `,
    input.name.trim(),
    input.type,
    input.lowBalanceThresholdMinor,
    now,
    input.id
  );
}

export async function setAccountActive(
  db: SQLiteDatabase,
  id: string,
  isActive: boolean
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE accounts
      SET
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `,
    isActive ? 1 : 0,
    now,
    id
  );
}
export async function getAllAccounts(
  db: SQLiteDatabase
): Promise<Account[]> {
  const rows = await db.getAllAsync<AccountRow>(
    `
      SELECT
        id,
        name,
        type,
        currency,
        balance_minor,
        low_balance_threshold_minor,
        icon,
        is_active,
        created_at,
        updated_at
      FROM accounts
      ORDER BY is_active DESC, created_at ASC
    `
  );

  return rows.map(mapAccountRow);
}