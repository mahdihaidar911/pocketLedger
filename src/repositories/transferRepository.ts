import * as Crypto from 'expo-crypto';

import type {
  SQLiteDatabase,
} from 'expo-sqlite';

import type {
  CreateTransferInput,
  CurrencyCode,
  Transfer,
  TransferListItem,
} from '../types';
import {
  convertLbpToUsdMinor,
  convertUsdMinorToLbp,
} from '../utils';

type AccountRow = {
  id: string;
  currency: string;
  balance_minor: number;
  is_active: number;
};

type ExchangeRateRow = {
  lbp_per_usd: number;
};

export async function createTransfer(
  db: SQLiteDatabase,
  input: CreateTransferInput
): Promise<Transfer> {
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0
  ) {
    throw new Error(
      'Transfer amount must be greater than zero.'
    );
  }

  if (
    input.sourceAccountId ===
    input.destinationAccountId
  ) {
    throw new Error(
      'Choose two different accounts.'
    );
  }

  const id = Crypto.randomUUID();

  const now = new Date().toISOString();

  const occurredAt =
    input.occurredAt ?? now;

  let createdTransfer: Transfer | null =
    null;

  await db.withExclusiveTransactionAsync(
    async (txn) => {
      const source =
        await txn.getFirstAsync<AccountRow>(
          `
            SELECT
              id,
              currency,
              balance_minor,
              is_active

            FROM accounts

            WHERE id = ?

            LIMIT 1
          `,
          input.sourceAccountId
        );

      const destination =
        await txn.getFirstAsync<AccountRow>(
          `
            SELECT
              id,
              currency,
              balance_minor,
              is_active

            FROM accounts

            WHERE id = ?

            LIMIT 1
          `,
          input.destinationAccountId
        );

      if (!source) {
        throw new Error(
          'Source account not found.'
        );
      }

      if (!destination) {
        throw new Error(
          'Destination account not found.'
        );
      }

      if (source.is_active !== 1) {
        throw new Error(
          'The source account is inactive.'
        );
      }

      if (destination.is_active !== 1) {
        throw new Error(
          'The destination account is inactive.'
        );
      }

      if (
        source.balance_minor <
        input.amountMinor
      ) {
        throw new Error(
          'The source account does not have enough balance.'
        );
      }

      const sourceCurrency =
        source.currency as CurrencyCode;

      const destinationCurrency =
        destination.currency as CurrencyCode;

      let destinationAmountMinor =
        input.amountMinor;

      let exchangeRateLbpPerUsd:
        number | null = null;

      // Currency conversion required
      if (
        sourceCurrency !==
        destinationCurrency
      ) {
        const rate =
          await txn.getFirstAsync<ExchangeRateRow>(
            `
              SELECT
                lbp_per_usd

              FROM exchange_rates

              ORDER BY
                effective_at DESC,
                created_at DESC

              LIMIT 1
            `
          );

        if (!rate) {
          throw new Error(
            'Set the USD/LBP exchange rate before making a currency conversion transfer.'
          );
        }

        exchangeRateLbpPerUsd =
          rate.lbp_per_usd;

        if (
          sourceCurrency === 'USD' &&
          destinationCurrency === 'LBP'
        ) {
          destinationAmountMinor =
            convertUsdMinorToLbp(
              input.amountMinor,
              exchangeRateLbpPerUsd
            );
        } else if (
          sourceCurrency === 'LBP' &&
          destinationCurrency === 'USD'
        ) {
          destinationAmountMinor =
            convertLbpToUsdMinor(
              input.amountMinor,
              exchangeRateLbpPerUsd
            );
        } else {
          throw new Error(
            'Unsupported currency conversion.'
          );
        }

        if (
          destinationAmountMinor <= 0
        ) {
          throw new Error(
            'The converted transfer amount is too small.'
          );
        }
      }

      await txn.runAsync(
        `
          INSERT INTO transfers (
            id,
            source_account_id,
            destination_account_id,
            source_amount_minor,
            destination_amount_minor,
            source_currency,
            destination_currency,
            exchange_rate_lbp_per_usd,
            note,
            occurred_at,
            created_at,
            updated_at
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
        `,
        id,
        input.sourceAccountId,
        input.destinationAccountId,
        input.amountMinor,
        destinationAmountMinor,
        sourceCurrency,
        destinationCurrency,
        exchangeRateLbpPerUsd,
        input.note?.trim() || null,
        occurredAt,
        now,
        now
      );

      // Remove money from source
      await txn.runAsync(
        `
          UPDATE accounts

          SET
            balance_minor =
              balance_minor - ?,

            updated_at = ?

          WHERE id = ?
        `,
        input.amountMinor,
        now,
        input.sourceAccountId
      );

      // Add converted amount to destination
      await txn.runAsync(
        `
          UPDATE accounts

          SET
            balance_minor =
              balance_minor + ?,

            updated_at = ?

          WHERE id = ?
        `,
        destinationAmountMinor,
        now,
        input.destinationAccountId
      );

      createdTransfer = {
        id,

        sourceAccountId:
          input.sourceAccountId,

        destinationAccountId:
          input.destinationAccountId,

        sourceAmountMinor:
          input.amountMinor,

        destinationAmountMinor,

        sourceCurrency,

        destinationCurrency,

        exchangeRateLbpPerUsd,

        note:
          input.note?.trim() || null,

        occurredAt,

        createdAt: now,

        updatedAt: now,
      };
    }
  );

  if (!createdTransfer) {
    throw new Error(
      'Transfer could not be created.'
    );
  }

  return createdTransfer;
}

type TransferListRow = {
  id: string;

  source_account_id: string;
  destination_account_id: string;

  source_amount_minor: number;
  destination_amount_minor: number;

  source_currency: string;
  destination_currency: string;

  exchange_rate_lbp_per_usd:
    number | null;

  note: string | null;

  occurred_at: string;
  created_at: string;
  updated_at: string;

  source_account_name: string;
  destination_account_name: string;
};

export async function getRecentTransfers(
  db: SQLiteDatabase,
  limit = 50
): Promise<TransferListItem[]> {
  const rows =
    await db.getAllAsync<TransferListRow>(
      `
        SELECT
          t.id,

          t.source_account_id,
          t.destination_account_id,

          t.source_amount_minor,
          t.destination_amount_minor,

          t.source_currency,
          t.destination_currency,

          t.exchange_rate_lbp_per_usd,

          t.note,

          t.occurred_at,
          t.created_at,
          t.updated_at,

          source.name
            AS source_account_name,

          destination.name
            AS destination_account_name

        FROM transfers t

        INNER JOIN accounts source
          ON source.id =
            t.source_account_id

        INNER JOIN accounts destination
          ON destination.id =
            t.destination_account_id

        ORDER BY
          t.occurred_at DESC,
          t.created_at DESC

        LIMIT ?
      `,
      limit
    );

  return rows.map((row) => ({
    id: row.id,

    sourceAccountId:
      row.source_account_id,

    destinationAccountId:
      row.destination_account_id,

    sourceAmountMinor:
      row.source_amount_minor,

    destinationAmountMinor:
      row.destination_amount_minor,

sourceCurrency: row.source_currency as CurrencyCode,

destinationCurrency:
  row.destination_currency as CurrencyCode,

    exchangeRateLbpPerUsd:
      row.exchange_rate_lbp_per_usd,

    note: row.note,

    occurredAt:
      row.occurred_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    sourceAccountName:
      row.source_account_name,

    destinationAccountName:
      row.destination_account_name,
  }));
}
export async function getTransfersForAccount(
  db: SQLiteDatabase,
  accountId: string,
  limit = 100
): Promise<TransferListItem[]> {
  const rows =
    await db.getAllAsync<TransferListRow>(
      `
        SELECT
          t.id,

          t.source_account_id,
          t.destination_account_id,

          t.source_amount_minor,
          t.destination_amount_minor,

          t.source_currency,
          t.destination_currency,

          t.exchange_rate_lbp_per_usd,

          t.note,

          t.occurred_at,
          t.created_at,
          t.updated_at,

          source.name
            AS source_account_name,

          destination.name
            AS destination_account_name

        FROM transfers t

        INNER JOIN accounts source
          ON source.id =
            t.source_account_id

        INNER JOIN accounts destination
          ON destination.id =
            t.destination_account_id

        WHERE
          t.source_account_id = ?
          OR
          t.destination_account_id = ?

        ORDER BY
          t.occurred_at DESC,
          t.created_at DESC

        LIMIT ?
      `,
      accountId,
      accountId,
      limit
    );

  return rows.map((row) => ({
    id: row.id,

    sourceAccountId:
      row.source_account_id,

    destinationAccountId:
      row.destination_account_id,

    sourceAmountMinor:
      row.source_amount_minor,

    destinationAmountMinor:
      row.destination_amount_minor,

    sourceCurrency:
      row.source_currency as CurrencyCode,

    destinationCurrency:
      row.destination_currency as CurrencyCode,

    exchangeRateLbpPerUsd:
      row.exchange_rate_lbp_per_usd,

    note: row.note,

    occurredAt:
      row.occurred_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    sourceAccountName:
      row.source_account_name,

    destinationAccountName:
      row.destination_account_name,
  }));
}