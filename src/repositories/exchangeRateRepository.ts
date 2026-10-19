import * as Crypto from 'expo-crypto';

import type {
    SQLiteDatabase,
} from 'expo-sqlite';

import type {
    ExchangeRate,
} from '../types';

type ExchangeRateRow = {
  id: string;

  lbp_per_usd: number;

  effective_at: string;

  created_at: string;
};

function mapExchangeRateRow(
  row: ExchangeRateRow
): ExchangeRate {
  return {
    id: row.id,

    lbpPerUsd:
      row.lbp_per_usd,

    effectiveAt:
      row.effective_at,

    createdAt:
      row.created_at,
  };
}

export async function getCurrentExchangeRate(
  db: SQLiteDatabase
): Promise<ExchangeRate | null> {
  const row =
    await db.getFirstAsync<ExchangeRateRow>(
      `
        SELECT
          id,
          lbp_per_usd,
          effective_at,
          created_at

        FROM exchange_rates

        ORDER BY
          effective_at DESC,
          created_at DESC

        LIMIT 1
      `
    );

  return row
    ? mapExchangeRateRow(row)
    : null;
}

export async function setExchangeRate(
  db: SQLiteDatabase,
  lbpPerUsd: number
): Promise<ExchangeRate> {
  if (
    !Number.isSafeInteger(lbpPerUsd) ||
    lbpPerUsd <= 0
  ) {
    throw new Error(
      'Exchange rate must be a positive whole number.'
    );
  }

  const id = Crypto.randomUUID();

  const now =
    new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO exchange_rates (
        id,
        lbp_per_usd,
        effective_at,
        created_at
      )

      VALUES (?, ?, ?, ?)
    `,
    id,
    lbpPerUsd,
    now,
    now
  );

  return {
    id,

    lbpPerUsd,

    effectiveAt: now,

    createdAt: now,
  };
}