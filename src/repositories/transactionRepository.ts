import * as Crypto from 'expo-crypto';

import type {
  SQLiteDatabase,
} from 'expo-sqlite';

import type {
  CreateTransactionInput,
  CurrencyCode,
  Transaction,
  TransactionListItem,
  TransactionType,
  UpdateTransactionInput,
} from '../types';
import { ValidationError } from '../utils/errors';

type AccountRow = {
  id: string;
  currency: string;
  is_active: number;
};

type CategoryRow = {
  id: string;
  kind: string;
  is_active: number;
};

function validateTransactionAmount(amount: number, type: TransactionType): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ValidationError('Enter a valid transaction amount greater than zero.');
  }
  if (type !== 'expense' && type !== 'income') {
    throw new ValidationError('Choose expense or income.');
  }
}

function signedAmount(type: TransactionType, amount: number): number {
  return type === 'expense' ? -amount : amount;
}

// Called only inside an exclusive transaction, so concurrent account activity
// cannot be overwritten between reading the balance and applying the change.
async function adjustBalance(
  txn: SQLiteDatabase,
  accountId: string,
  delta: number,
  now: string
): Promise<void> {
  const account = await txn.getFirstAsync<{ balance_minor: number }>(
    'SELECT balance_minor FROM accounts WHERE id = ?', accountId
  );
  if (!account) throw new Error('The transaction account could not be found.');
  const balance = account.balance_minor + delta;
  if (!Number.isSafeInteger(account.balance_minor) ||
      !Number.isSafeInteger(delta) || !Number.isSafeInteger(balance)) {
    throw new ValidationError('This change would exceed the supported account balance.');
  }
  if (delta === 0) return;
  await txn.runAsync(
    'UPDATE accounts SET balance_minor = ?, updated_at = ? WHERE id = ?',
    balance, now, accountId
  );
}

export async function createTransaction(
  db: SQLiteDatabase,
  input: CreateTransactionInput
): Promise<Transaction> {
  validateTransactionAmount(input.amountMinor, input.type);

  const id = Crypto.randomUUID();

  const now =
    new Date().toISOString();

  const occurredAt =
    input.occurredAt ?? now;

  let createdTransaction:
    | Transaction
    | null = null;

  await db.withExclusiveTransactionAsync(
    async (txn) => {
      const account =
        await txn.getFirstAsync<AccountRow>(
          `
            SELECT
              id,
              currency,
              is_active

            FROM accounts

            WHERE id = ?

            LIMIT 1
          `,
          input.accountId
        );

      if (!account) {
        throw new ValidationError(
          'Account not found.'
        );
      }

      if (account.is_active !== 1) {
        throw new ValidationError(
          'The selected account is inactive.'
        );
      }

      if (input.categoryId) {
        const category =
          await txn.getFirstAsync<CategoryRow>(
            `
              SELECT
                id,
                kind,
                is_active

              FROM categories

              WHERE id = ?

              LIMIT 1
            `,
            input.categoryId
          );

        if (!category) {
          throw new ValidationError(
            'Category not found.'
          );
        }

        if (category.is_active !== 1) {
          throw new ValidationError(
            'The selected category is inactive.'
          );
        }

        if (
          category.kind !== input.type
        ) {
          throw new ValidationError(
            'The selected category does not match the transaction type.'
          );
        }
      }

      const currency =
        account.currency as CurrencyCode;

      await txn.runAsync(
        `
          INSERT INTO transactions (
            id,
            type,
            account_id,
            category_id,
            amount_minor,
            currency,
            merchant,
            note,
            occurred_at,
            exchange_rate_lbp_per_usd,
            created_at,
            updated_at
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        id,
        input.type,
        input.accountId,
        input.categoryId,
        input.amountMinor,
        currency,
        input.merchant?.trim() || null,
        input.note?.trim() || null,
        occurredAt,
        input.exchangeRateLbpPerUsd ??
          null,
        now,
        now
      );

      await adjustBalance(txn, input.accountId,
        signedAmount(input.type, input.amountMinor), now);

      createdTransaction = {
        id,

        type: input.type,

        accountId:
          input.accountId,

        categoryId:
          input.categoryId,

        amountMinor:
          input.amountMinor,

        currency,

        merchant:
          input.merchant?.trim() ||
          null,

        note:
          input.note?.trim() ||
          null,

        occurredAt,

        exchangeRateLbpPerUsd:
          input.exchangeRateLbpPerUsd ??
          null,

        createdAt: now,

        updatedAt: now,
      };
    }
  );

  if (!createdTransaction) {
    throw new Error(
      'Transaction could not be created.'
    );
  }

  // Fire a low-balance alert if the account has dropped below its threshold.
  // This runs outside the exclusive transaction so the committed balance is visible.
  // Failures are intentionally swallowed — a notification error must never
  // prevent a financial record from being returned to the caller.
  // createdTransaction is guaranteed non-null here (the throw above guards it).
  return createdTransaction as Transaction;
}
type TransactionListRow = {
  id: string;

  type: string;

  account_id: string;

  category_id: string | null;

  amount_minor: number;

  currency: string;

  merchant: string | null;

  note: string | null;

  occurred_at: string;

  exchange_rate_lbp_per_usd:
    number | null;

  created_at: string;

  updated_at: string;

  account_name: string;

  category_name: string | null;

  category_icon: string | null;
};

export async function getRecentTransactions(
  db: SQLiteDatabase,
  limit = 50
): Promise<TransactionListItem[]> {
  const rows =
    await db.getAllAsync<TransactionListRow>(
      `
        SELECT
          t.id,
          t.type,
          t.account_id,
          t.category_id,
          t.amount_minor,
          t.currency,
          t.merchant,
          t.note,
          t.occurred_at,
          t.exchange_rate_lbp_per_usd,
          t.created_at,
          t.updated_at,

          a.name AS account_name,

          c.name AS category_name,
          c.icon AS category_icon

        FROM transactions t

        INNER JOIN accounts a
          ON a.id = t.account_id

        LEFT JOIN categories c
          ON c.id = t.category_id

        ORDER BY
          t.occurred_at DESC,
          t.created_at DESC

        LIMIT ?
      `,
      limit
    );

  return rows.map(mapTransactionRow);
}

function mapTransactionRow(row: TransactionListRow): TransactionListItem {
  return {
    id: row.id,

    type:
      row.type as TransactionType,

    accountId:
      row.account_id,

    categoryId:
      row.category_id,

    amountMinor:
      row.amount_minor,

    currency:
      row.currency as CurrencyCode,

    merchant:
      row.merchant,

    note:
      row.note,

    occurredAt:
      row.occurred_at,

    exchangeRateLbpPerUsd:
      row.exchange_rate_lbp_per_usd,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    accountName:
      row.account_name,

    categoryName:
      row.category_name,

    categoryIcon:
      row.category_icon,
  };
}

export async function getTransactionById(
  db: SQLiteDatabase,
  id: string
): Promise<TransactionListItem | null> {
  const row = await db.getFirstAsync<TransactionListRow>(
    `SELECT t.*, a.name AS account_name,
      c.name AS category_name, c.icon AS category_icon
     FROM transactions t
     INNER JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = ? LIMIT 1`, id
  );
  return row ? mapTransactionRow(row) : null;
}

function assertCurrentVersion(
  item: TransactionListItem | null,
  expectedUpdatedAt: string
): asserts item is TransactionListItem {
  if (!item) throw new ValidationError('This transaction no longer exists.');
  if (item.updatedAt !== expectedUpdatedAt) {
    throw new ValidationError('This transaction has changed. Go back and reopen it before trying again.');
  }
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: string,
  input: UpdateTransactionInput
): Promise<void> {
  validateTransactionAmount(input.amountMinor, input.type);
  await db.withExclusiveTransactionAsync(async (txn) => {
    const original = await getTransactionById(txn, id);
    assertCurrentVersion(original, input.expectedUpdatedAt);

    const account = await txn.getFirstAsync<AccountRow>(
      'SELECT id, currency, is_active FROM accounts WHERE id = ?', input.accountId
    );
    if (!account) throw new ValidationError('Account not found.');
    if (account.currency !== original.currency) {
      throw new ValidationError('Choose an account with the same currency as this transaction.');
    }
    // Historical records can retain their inactive account/category, but cannot
    // be moved to another inactive one.
    if (account.is_active !== 1 && account.id !== original.accountId) {
      throw new ValidationError('The selected account is inactive.');
    }
    if (input.categoryId !== null) {
      const category = await txn.getFirstAsync<CategoryRow>(
        'SELECT id, kind, is_active FROM categories WHERE id = ?', input.categoryId
      );
      if (!category) throw new ValidationError('Category not found.');
      if (category.kind !== input.type) {
        throw new ValidationError('The selected category does not match the transaction type.');
      }
      if (category.is_active !== 1 &&
          !(category.id === original.categoryId && input.type === original.type)) {
        throw new ValidationError('The selected category is inactive.');
      }
    }

    // Ensure the optimistic version changes even for two edits in one millisecond.
    const now = new Date(Math.max(Date.now(), Date.parse(original.updatedAt) + 1)).toISOString();
    const previousEffect = signedAmount(original.type, original.amountMinor);
    const nextEffect = signedAmount(input.type, input.amountMinor);
    if (original.accountId === input.accountId) {
      await adjustBalance(txn, original.accountId, nextEffect - previousEffect, now);
    } else {
      await adjustBalance(txn, original.accountId, -previousEffect, now);
      await adjustBalance(txn, input.accountId, nextEffect, now);
    }

    await txn.runAsync(
      `UPDATE transactions SET type = ?, account_id = ?, category_id = ?,
        amount_minor = ?, merchant = ?, note = ?, updated_at = ? WHERE id = ?`,
      input.type, input.accountId, input.categoryId, input.amountMinor,
      input.merchant?.trim() || null, input.note?.trim() || null, now, id
    );
  });

}

export async function deleteTransaction(
  db: SQLiteDatabase,
  id: string,
  expectedUpdatedAt: string
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const original = await getTransactionById(txn, id);
    assertCurrentVersion(original, expectedUpdatedAt);
    await adjustBalance(txn, original.accountId,
      -signedAmount(original.type, original.amountMinor), new Date().toISOString());
    await txn.runAsync('DELETE FROM transactions WHERE id = ?', id);
  });
}

export interface ExpenseTotals {
  usdMinor: number;
  lbpMinor: number;
}

type ExpenseTotalsRow = {
  usd_minor: number | null;
  lbp_minor: number | null;
};

export async function getExpenseTotalsSince(
  db: SQLiteDatabase,
  startIso: string
): Promise<ExpenseTotals> {
  const row =
    await db.getFirstAsync<ExpenseTotalsRow>(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN currency = 'USD'
                THEN amount_minor
                ELSE 0
              END
            ),
            0
          ) AS usd_minor,

          COALESCE(
            SUM(
              CASE
                WHEN currency = 'LBP'
                THEN amount_minor
                ELSE 0
              END
            ),
            0
          ) AS lbp_minor

        FROM transactions

        WHERE
          type = 'expense'
          AND occurred_at >= ?
      `,
      startIso
    );

  return {
    usdMinor:
      row?.usd_minor ?? 0,

    lbpMinor:
      row?.lbp_minor ?? 0,
  };
}
