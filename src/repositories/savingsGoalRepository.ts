import * as Crypto from 'expo-crypto';

import type {
    SQLiteDatabase,
} from 'expo-sqlite';

import type {
    CreateSavingsGoalInput,
    CurrencyCode,
    SavingsGoal,
    SavingsGoalListItem,
    UpdateSavingsGoalInput,
} from '../types';

type SavingsGoalListRow = {
  id: string;
  name: string;

  account_id: string;

  target_amount_minor: number;

  currency: string;

  target_date: string | null;

  icon: string | null;

  is_completed: number;
  is_active: number;

  created_at: string;
  updated_at: string;

  current_amount_minor: number;

  account_name: string;
};

export async function createSavingsGoal(
  db: SQLiteDatabase,
  input: CreateSavingsGoalInput
): Promise<SavingsGoal> {
  const name =
    input.name.trim();

  if (!name) {
    throw new Error(
      'Savings goal name is required.'
    );
  }

  if (
    !Number.isSafeInteger(
      input.targetAmountMinor
    ) ||
    input.targetAmountMinor <= 0
  ) {
    throw new Error(
      'Target amount must be greater than zero.'
    );
  }

  const goalId =
    Crypto.randomUUID();

  const accountId =
    Crypto.randomUUID();

  const now =
    new Date().toISOString();

  await db.withExclusiveTransactionAsync(
    async (txn) => {
      await txn.runAsync(
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

          VALUES (
            ?, ?, 'savings', ?, 0,
            NULL, ?, 1, ?, ?
          )
        `,
        accountId,
        `Savings • ${name}`,
        input.currency,
        input.icon ?? 'wallet-outline',
        now,
        now
      );

      await txn.runAsync(
        `
          INSERT INTO savings_goals (
            id,
            name,
            account_id,
            target_amount_minor,
            currency,
            target_date,
            icon,
            is_completed,
            is_active,
            created_at,
            updated_at
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            0, 1, ?, ?
          )
        `,
        goalId,
        name,
        accountId,
        input.targetAmountMinor,
        input.currency,
        input.targetDate ?? null,
        input.icon ?? 'flag-outline',
        now,
        now
      );
    }
  );

  return {
    id: goalId,

    name,

    accountId,

    targetAmountMinor:
      input.targetAmountMinor,

    currency:
      input.currency,

    targetDate:
      input.targetDate ?? null,

    icon:
      input.icon ?? 'flag-outline',

    isCompleted: false,

    isActive: true,

    createdAt: now,

    updatedAt: now,
  };
}

export async function getSavingsGoals(
  db: SQLiteDatabase
): Promise<SavingsGoalListItem[]> {
  const rows =
    await db.getAllAsync<SavingsGoalListRow>(
      `
        SELECT
          g.id,
          g.name,
          g.account_id,
          g.target_amount_minor,
          g.currency,
          g.target_date,
          g.icon,
          g.is_completed,
          g.is_active,
          g.created_at,
          g.updated_at,

          a.balance_minor
            AS current_amount_minor,

          a.name
            AS account_name

        FROM savings_goals g

        INNER JOIN accounts a
          ON a.id = g.account_id

        WHERE
          g.is_active = 1

        ORDER BY
          g.is_completed ASC,
          g.created_at DESC
      `
    );

  return rows.map((row) => ({
    id: row.id,

    name: row.name,

    accountId:
      row.account_id,

    targetAmountMinor:
      row.target_amount_minor,

    currency:
      row.currency as CurrencyCode,

    targetDate:
      row.target_date,

    icon: row.icon,

    isCompleted:
      row.is_completed === 1,

    isActive:
      row.is_active === 1,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    currentAmountMinor:
      row.current_amount_minor,

    accountName:
      row.account_name,
  }));
}
export async function getSavingsGoalById(
  db: SQLiteDatabase,
  id: string
): Promise<SavingsGoalListItem | null> {
  const row =
    await db.getFirstAsync<SavingsGoalListRow>(
      `
        SELECT
          g.id,
          g.name,
          g.account_id,
          g.target_amount_minor,
          g.currency,
          g.target_date,
          g.icon,
          g.is_completed,
          g.is_active,
          g.created_at,
          g.updated_at,

          a.balance_minor
            AS current_amount_minor,

          a.name
            AS account_name

        FROM savings_goals g

        INNER JOIN accounts a
          ON a.id = g.account_id

        WHERE g.id = ?

        LIMIT 1
      `,
      id
    );

  if (!row) {
    return null;
  }

  return {
    id: row.id,

    name: row.name,

    accountId:
      row.account_id,

    targetAmountMinor:
      row.target_amount_minor,

    currency:
      row.currency as CurrencyCode,

    targetDate:
      row.target_date,

    icon:
      row.icon,

    isCompleted:
      row.is_completed === 1,

    isActive:
      row.is_active === 1,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    currentAmountMinor:
      row.current_amount_minor,

    accountName:
      row.account_name,
  };
}

export async function updateSavingsGoal(
  db: SQLiteDatabase,
  input: UpdateSavingsGoalInput
): Promise<void> {
  const name = input.name.trim();

  if (!name) {
    throw new Error(
      'Savings goal name is required.'
    );
  }

  if (
    !Number.isSafeInteger(
      input.targetAmountMinor
    ) ||
    input.targetAmountMinor <= 0
  ) {
    throw new Error(
      'Target amount must be greater than zero.'
    );
  }

  const now =
    new Date().toISOString();

  await db.withExclusiveTransactionAsync(
    async (txn) => {
      const goal =
        await txn.getFirstAsync<{
          account_id: string;
        }>(
          `
            SELECT account_id
            FROM savings_goals
            WHERE id = ?
            LIMIT 1
          `,
          input.id
        );

      if (!goal) {
        throw new Error(
          'Savings goal not found.'
        );
      }

      await txn.runAsync(
        `
          UPDATE savings_goals

          SET
            name = ?,
            target_amount_minor = ?,
            target_date = ?,
            updated_at = ?

          WHERE id = ?
        `,
        name,
        input.targetAmountMinor,
        input.targetDate ?? null,
        now,
        input.id
      );

      await txn.runAsync(
        `
          UPDATE accounts

          SET
            name = ?,
            updated_at = ?

          WHERE id = ?
        `,
        `Savings • ${name}`,
        now,
        goal.account_id
      );
    }
  );
}

export async function archiveSavingsGoal(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  const now =
    new Date().toISOString();

  await db.withExclusiveTransactionAsync(
    async (txn) => {
      const goal =
        await txn.getFirstAsync<{
          account_id: string;
          balance_minor: number;
        }>(
          `
            SELECT
              g.account_id,
              a.balance_minor

            FROM savings_goals g

            INNER JOIN accounts a
              ON a.id = g.account_id

            WHERE g.id = ?

            LIMIT 1
          `,
          id
        );

      if (!goal) {
        throw new Error(
          'Savings goal not found.'
        );
      }

      if (goal.balance_minor !== 0) {
        throw new Error(
          'Withdraw all money from this goal before archiving it.'
        );
      }

      await txn.runAsync(
        `
          UPDATE savings_goals

          SET
            is_active = 0,
            updated_at = ?

          WHERE id = ?
        `,
        now,
        id
      );

      await txn.runAsync(
        `
          UPDATE accounts

          SET
            is_active = 0,
            updated_at = ?

          WHERE id = ?
        `,
        now,
        goal.account_id
      );
    }
  );
}