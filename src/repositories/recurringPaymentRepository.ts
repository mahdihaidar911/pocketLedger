import * as Crypto from 'expo-crypto';

import type {
    SQLiteDatabase,
} from 'expo-sqlite';

import type {
    CreateRecurringPaymentInput,
    CurrencyCode,
    RecurringFrequency,
    RecurringPayment,
    RecurringPaymentListItem,
    TransactionType,
    UpdateRecurringPaymentInput,
} from '../types';
import {
    getNextRecurringDate,
} from '../utils';

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

type RecurringPaymentRow = {
  id: string;
  name: string;

  type: string;

  account_id: string;

  category_id: string | null;

  amount_minor: number;

  currency: string;

  frequency: string;

  interval_count: number;

  start_date: string;

  next_due_date: string;

  end_date: string | null;

  merchant: string | null;

  note: string | null;

  is_active: number;

  created_at: string;

  updated_at: string;

  account_name: string;

  category_name: string | null;

  category_icon: string | null;
};

export async function createRecurringPayment(
  db: SQLiteDatabase,
  input: CreateRecurringPaymentInput
): Promise<RecurringPayment> {
  const name = input.name.trim();

  if (!name) {
    throw new Error(
      'Recurring payment name is required.'
    );
  }

  if (
    !Number.isSafeInteger(
      input.amountMinor
    ) ||
    input.amountMinor <= 0
  ) {
    throw new Error(
      'Amount must be greater than zero.'
    );
  }

  const intervalCount =
    input.intervalCount ?? 1;

  if (
    !Number.isSafeInteger(
      intervalCount
    ) ||
    intervalCount <= 0
  ) {
    throw new Error(
      'Invalid recurrence interval.'
    );
  }

  const id =
    Crypto.randomUUID();

  const now =
    new Date().toISOString();

  let created:
    RecurringPayment | null = null;

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
        throw new Error(
          'Account not found.'
        );
      }

      if (account.is_active !== 1) {
        throw new Error(
          'This account is inactive.'
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
          throw new Error(
            'Category not found.'
          );
        }

        if (
          category.is_active !== 1
        ) {
          throw new Error(
            'This category is inactive.'
          );
        }

        if (
          category.kind !== input.type
        ) {
          throw new Error(
            'Category does not match the recurring payment type.'
          );
        }
      }

      const currency =
        account.currency as CurrencyCode;

      await txn.runAsync(
        `
          INSERT INTO recurring_payments (
            id,
            name,
            type,
            account_id,
            category_id,
            amount_minor,
            currency,
            frequency,
            interval_count,
            start_date,
            next_due_date,
            end_date,
            merchant,
            note,
            is_active,
            created_at,
            updated_at
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, NULL, ?, ?, 1, ?, ?
          )
        `,
        id,
        name,
        input.type,
        input.accountId,
        input.categoryId ?? null,
        input.amountMinor,
        currency,
        input.frequency,
        intervalCount,
        input.startDate,
        input.startDate,
        input.merchant?.trim() || null,
        input.note?.trim() || null,
        now,
        now
      );

      created = {
        id,

        name,

        type: input.type,

        accountId:
          input.accountId,

        categoryId:
          input.categoryId ?? null,

        amountMinor:
          input.amountMinor,

        currency,

        frequency:
          input.frequency,

        intervalCount,

        startDate:
          input.startDate,

        nextDueDate:
          input.startDate,

        endDate: null,

        merchant:
          input.merchant?.trim() ||
          null,

        note:
          input.note?.trim() ||
          null,

        isActive: true,

        createdAt: now,

        updatedAt: now,
      };
    }
  );

  if (!created) {
    throw new Error(
      'Recurring payment could not be created.'
    );
  }

  return created;
}

export async function getRecurringPayments(
  db: SQLiteDatabase
): Promise<RecurringPaymentListItem[]> {
  const rows =
    await db.getAllAsync<RecurringPaymentRow>(
      `
        SELECT
          r.id,
          r.name,
          r.type,
          r.account_id,
          r.category_id,
          r.amount_minor,
          r.currency,
          r.frequency,
          r.interval_count,
          r.start_date,
          r.next_due_date,
          r.end_date,
          r.merchant,
          r.note,
          r.is_active,
          r.created_at,
          r.updated_at,

          a.name
            AS account_name,

          c.name
            AS category_name,

          c.icon
            AS category_icon

        FROM recurring_payments r

        INNER JOIN accounts a
          ON a.id = r.account_id

        LEFT JOIN categories c
          ON c.id = r.category_id

        WHERE r.is_active = 1

        ORDER BY
          r.next_due_date ASC,
          r.created_at DESC
      `
    );

 return rows.map(
  mapRecurringPaymentRow
);
}
function mapRecurringPaymentRow(
  row: RecurringPaymentRow
): RecurringPaymentListItem {
  return {
    id: row.id,

    name: row.name,

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

    frequency:
      row.frequency as RecurringFrequency,

    intervalCount:
      row.interval_count,

    startDate:
      row.start_date,

    nextDueDate:
      row.next_due_date,

    endDate:
      row.end_date,

    merchant:
      row.merchant,

    note:
      row.note,

    isActive:
      row.is_active === 1,

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

const recurringPaymentSelect = `
  SELECT
    r.id,
    r.name,
    r.type,
    r.account_id,
    r.category_id,
    r.amount_minor,
    r.currency,
    r.frequency,
    r.interval_count,
    r.start_date,
    r.next_due_date,
    r.end_date,
    r.merchant,
    r.note,
    r.is_active,
    r.created_at,
    r.updated_at,
    a.name AS account_name,
    c.name AS category_name,
    c.icon AS category_icon
  FROM recurring_payments r
  INNER JOIN accounts a
    ON a.id = r.account_id
  LEFT JOIN categories c
    ON c.id = r.category_id
`;

export async function getUpcomingRecurringPayments(
  db: SQLiteDatabase,
  throughDate: string,
  limit = 4
): Promise<RecurringPaymentListItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate)) {
    throw new Error('Invalid upcoming date.');
  }

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('Invalid upcoming payment limit.');
  }

  const rows = await db.getAllAsync<RecurringPaymentRow>(
    `
      ${recurringPaymentSelect}
      WHERE
        r.is_active = 1
        AND r.next_due_date <= ?
        AND (
          r.end_date IS NULL
          OR r.next_due_date <= r.end_date
        )
      ORDER BY
        r.next_due_date ASC,
        r.created_at ASC
      LIMIT ?
    `,
    throughDate,
    limit
  );

  return rows.map(mapRecurringPaymentRow);
}

export async function updateRecurringPayment(
  db: SQLiteDatabase,
  id: string,
  input: UpdateRecurringPaymentInput
): Promise<void> {
  const name = input.name.trim();
  const intervalCount = input.intervalCount ?? 1;

  if (!name) {
    throw new Error('Recurring payment name is required.');
  }

  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  if (!Number.isSafeInteger(intervalCount) || intervalCount <= 0) {
    throw new Error('Invalid recurrence interval.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate)) {
    throw new Error('Invalid next due date.');
  }

  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string }>(
      'SELECT id FROM recurring_payments WHERE id = ? LIMIT 1',
      id
    );

    if (!existing) {
      throw new Error('Recurring payment not found.');
    }

    const account = await txn.getFirstAsync<AccountRow>(
      `
        SELECT id, currency, is_active
        FROM accounts
        WHERE id = ?
        LIMIT 1
      `,
      input.accountId
    );

    if (!account) {
      throw new Error('Account not found.');
    }

    if (account.is_active !== 1) {
      throw new Error('This account is inactive.');
    }

    if (input.categoryId) {
      const category = await txn.getFirstAsync<CategoryRow>(
        `
          SELECT id, kind, is_active
          FROM categories
          WHERE id = ?
          LIMIT 1
        `,
        input.categoryId
      );

      if (!category) {
        throw new Error('Category not found.');
      }

      if (category.is_active !== 1) {
        throw new Error('This category is inactive.');
      }

      if (category.kind !== input.type) {
        throw new Error('Category does not match the recurring payment type.');
      }
    }

    await txn.runAsync(
      `
        UPDATE recurring_payments
        SET
          name = ?,
          type = ?,
          account_id = ?,
          category_id = ?,
          amount_minor = ?,
          currency = ?,
          frequency = ?,
          interval_count = ?,
          next_due_date = ?,
          merchant = ?,
          note = ?,
          updated_at = ?
        WHERE id = ?
      `,
      name,
      input.type,
      input.accountId,
      input.categoryId ?? null,
      input.amountMinor,
      account.currency,
      input.frequency,
      intervalCount,
      input.nextDueDate,
      input.merchant?.trim() || null,
      input.note?.trim() || null,
      now,
      id
    );
  });
}
export async function getRecurringPaymentById(
  db: SQLiteDatabase,
  id: string
): Promise<RecurringPaymentListItem | null> {
  const row =
    await db.getFirstAsync<RecurringPaymentRow>(
      `
        SELECT
          r.id,
          r.name,
          r.type,
          r.account_id,
          r.category_id,
          r.amount_minor,
          r.currency,
          r.frequency,
          r.interval_count,
          r.start_date,
          r.next_due_date,
          r.end_date,
          r.merchant,
          r.note,
          r.is_active,
          r.created_at,
          r.updated_at,

          a.name
            AS account_name,

          c.name
            AS category_name,

          c.icon
            AS category_icon

        FROM recurring_payments r

        INNER JOIN accounts a
          ON a.id = r.account_id

        LEFT JOIN categories c
          ON c.id = r.category_id

        WHERE r.id = ?

        LIMIT 1
      `,
      id
    );

  if (!row) {
    return null;
  }

  return mapRecurringPaymentRow(
    row
  );
}
export async function recordRecurringPayment(
  db: SQLiteDatabase,
  recurringId: string
): Promise<{
  transactionId: string;
  nextDueDate: string;
}> {
  const transactionId =
    Crypto.randomUUID();

  const now =
    new Date().toISOString();

  let resultingNextDueDate:
    string | null = null;

  await db.withExclusiveTransactionAsync(
    async (txn) => {
      const recurring =
        await txn.getFirstAsync<{
          id: string;
          name: string;
          type: string;
          account_id: string;
          category_id: string | null;
          amount_minor: number;
          currency: string;
          frequency: string;
          interval_count: number;
          next_due_date: string;
          merchant: string | null;
          note: string | null;
          is_active: number;
        }>(
          `
            SELECT
              id,
              name,
              type,
              account_id,
              category_id,
              amount_minor,
              currency,
              frequency,
              interval_count,
              next_due_date,
              merchant,
              note,
              is_active

            FROM recurring_payments

            WHERE id = ?

            LIMIT 1
          `,
          recurringId
        );

      if (!recurring) {
        throw new Error(
          'Recurring payment not found.'
        );
      }

      if (
        recurring.is_active !== 1
      ) {
        throw new Error(
          'This recurring payment is paused.'
        );
      }

      const account =
        await txn.getFirstAsync<{
          currency: string;
          is_active: number;
        }>(
          `
            SELECT
              currency,
              is_active

            FROM accounts

            WHERE id = ?

            LIMIT 1
          `,
          recurring.account_id
        );

      if (!account) {
        throw new Error(
          'Account not found.'
        );
      }

      if (
        account.is_active !== 1
      ) {
        throw new Error(
          'The account is inactive.'
        );
      }

      if (
        account.currency !==
        recurring.currency
      ) {
        throw new Error(
          'Recurring payment currency no longer matches its account.'
        );
      }

      if (
        recurring.category_id
      ) {
        const category =
          await txn.getFirstAsync<{
            kind: string;
            is_active: number;
          }>(
            `
              SELECT
                kind,
                is_active

              FROM categories

              WHERE id = ?

              LIMIT 1
            `,
            recurring.category_id
          );

        if (!category) {
          throw new Error(
            'Category not found.'
          );
        }

        if (
          category.is_active !== 1
        ) {
          throw new Error(
            'The recurring payment category is inactive.'
          );
        }

        if (
          category.kind !==
          recurring.type
        ) {
          throw new Error(
            'Category does not match the recurring payment type.'
          );
        }
      }

      const nextDueDate =
        getNextRecurringDate(
          recurring.next_due_date,
          recurring.frequency as RecurringFrequency,
          recurring.interval_count
        );

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
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            NULL, ?, ?
          )
        `,
        transactionId,
        recurring.type,
        recurring.account_id,
        recurring.category_id,
        recurring.amount_minor,
        recurring.currency,
        recurring.merchant,
        recurring.note,
        now,
        now,
        now
      );

      const balanceChange =
        recurring.type ===
        'expense'
          ? -recurring.amount_minor
          : recurring.amount_minor;

      await txn.runAsync(
        `
          UPDATE accounts

          SET
            balance_minor =
              balance_minor + ?,

            updated_at = ?

          WHERE id = ?
        `,
        balanceChange,
        now,
        recurring.account_id
      );

      await txn.runAsync(
        `
          UPDATE recurring_payments

          SET
            next_due_date = ?,
            updated_at = ?

          WHERE id = ?
        `,
        nextDueDate,
        now,
        recurring.id
      );

      resultingNextDueDate =
        nextDueDate;
    }
  );

  if (!resultingNextDueDate) {
    throw new Error(
      'Recurring payment could not be recorded.'
    );
  }

  return {
    transactionId,

    nextDueDate:
      resultingNextDueDate,
  };
}
export async function skipRecurringPayment(
  db: SQLiteDatabase,
  recurringId: string
): Promise<string> {
  const recurring =
    await db.getFirstAsync<{
      frequency: string;
      interval_count: number;
      next_due_date: string;
      is_active: number;
    }>(
      `
        SELECT
          frequency,
          interval_count,
          next_due_date,
          is_active

        FROM recurring_payments

        WHERE id = ?

        LIMIT 1
      `,
      recurringId
    );

  if (!recurring) {
    throw new Error(
      'Recurring payment not found.'
    );
  }

  if (
    recurring.is_active !== 1
  ) {
    throw new Error(
      'This recurring payment is paused.'
    );
  }

  const nextDueDate =
    getNextRecurringDate(
      recurring.next_due_date,
      recurring.frequency as RecurringFrequency,
      recurring.interval_count
    );

  await db.runAsync(
    `
      UPDATE recurring_payments

      SET
        next_due_date = ?,
        updated_at = ?

      WHERE id = ?
    `,
    nextDueDate,
    new Date().toISOString(),
    recurringId
  );

  return nextDueDate;
}
export async function setRecurringPaymentActive(
  db: SQLiteDatabase,
  recurringId: string,
  isActive: boolean
): Promise<void> {
  await db.runAsync(
    `
      UPDATE recurring_payments

      SET
        is_active = ?,
        updated_at = ?

      WHERE id = ?
    `,
    isActive ? 1 : 0,
    new Date().toISOString(),
    recurringId
  );
}
