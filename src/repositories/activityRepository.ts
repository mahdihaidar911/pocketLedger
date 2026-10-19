import type {
    SQLiteDatabase,
} from 'expo-sqlite';

import type {
    ActivityCursor,
    ActivityFilters,
    ActivityListItem,
    ActivityPage,
    CurrencyCode,
    TransactionType,
} from '../types';
import { ValidationError } from '../utils/errors';

import {
    getRecentTransactions,
} from './transactionRepository';

import {
    getRecentTransfers,
} from './transferRepository';

export async function getRecentActivity(
  db: SQLiteDatabase,
  limit = 50
): Promise<ActivityListItem[]> {
  const [
    transactions,
    transfers,
  ] = await Promise.all([
    getRecentTransactions(
      db,
      limit
    ),

    getRecentTransfers(
      db,
      limit
    ),
  ]);

  const activity: ActivityListItem[] = [
    ...transactions.map(
      (transaction) => ({
        kind: 'transaction' as const,
        data: transaction,
      })
    ),

    ...transfers.map(
      (transfer) => ({
        kind: 'transfer' as const,
        data: transfer,
      })
    ),
  ];

  return activity
    .sort(
      (a, b) =>
        new Date(
          b.data.occurredAt
        ).getTime() -
        new Date(
          a.data.occurredAt
        ).getTime()
    )
    .slice(0, limit);
}

type ActivityRow = {
  kind: 'transaction' | 'transfer';
  id: string;
  type: TransactionType | 'transfer';
  account_id: string;
  account_name: string;
  destination_account_id: string | null;
  destination_account_name: string | null;
  amount_minor: number;
  currency: CurrencyCode;
  destination_amount_minor: number | null;
  destination_currency: CurrencyCode | null;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  merchant: string | null;
  note: string | null;
  exchange_rate_lbp_per_usd: number | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

function mapActivityRow(row: ActivityRow): ActivityListItem {
  const common = {
    id: row.id, note: row.note,
    exchangeRateLbpPerUsd: row.exchange_rate_lbp_per_usd,
    occurredAt: row.occurred_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
  if (row.kind === 'transfer') {
    if (!row.destination_account_id || row.destination_account_name === null ||
        row.destination_amount_minor === null || row.destination_currency === null) {
      throw new Error('Transfer details are incomplete.');
    }
    return { kind: 'transfer', data: {
      ...common, sourceAccountId: row.account_id, sourceAccountName: row.account_name,
      destinationAccountId: row.destination_account_id, destinationAccountName: row.destination_account_name,
      sourceAmountMinor: row.amount_minor, sourceCurrency: row.currency,
      destinationAmountMinor: row.destination_amount_minor, destinationCurrency: row.destination_currency,
    } };
  }
  return { kind: 'transaction', data: {
    ...common, type: row.type as TransactionType, accountId: row.account_id, accountName: row.account_name,
    amountMinor: row.amount_minor, currency: row.currency, categoryId: row.category_id,
    categoryName: row.category_name, categoryIcon: row.category_icon, merchant: row.merchant,
  } };
}

// Filtering takes place before pagination, across the entire history. This is
// deliberately separate from Home's existing small getRecentActivity query.
export async function getActivityPage(
  db: SQLiteDatabase,
  filters: ActivityFilters = {},
  options: { limit?: number; cursor?: ActivityCursor | null } = {}
): Promise<ActivityPage> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError('The activity page size must be between 1 and 100.');
  }
  const rows = await queryActivityRows(db, filters, { limit: limit + 1, cursor: options.cursor });
  const visible = rows.slice(0, limit);
  const last = visible[visible.length - 1];
  return {
    items: visible.map(mapActivityRow),
    nextCursor: rows.length > limit && last ? {
      occurredAt: last.occurred_at, createdAt: last.created_at, kind: last.kind, id: last.id,
    } : null,
  };
}

// One SELECT reads a consistent snapshot across both tables. No UI page limit
// applies, and no separately read pages can mix different database revisions.
export async function getActivityForExport(
  db: SQLiteDatabase,
  filters: ActivityFilters
): Promise<ActivityListItem[]> {
  return (await queryActivityRows(db, filters)).map(mapActivityRow);
}

async function queryActivityRows(
  db: SQLiteDatabase,
  filters: ActivityFilters,
  options: { limit?: number; cursor?: ActivityCursor | null } = {}
): Promise<ActivityRow[]> {
  if (filters.type && !['all', 'expense', 'income', 'transfer'].includes(filters.type)) {
    throw new ValidationError('Choose a valid activity type.');
  }
  for (const date of [filters.startIso, filters.endIso]) {
    if (date !== undefined && (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date)) {
      throw new ValidationError('Invalid activity date range.');
    }
  }
  if (filters.startIso && filters.endIso && filters.startIso >= filters.endIso) {
    throw new ValidationError('The end date must be after the start date.');
  }
  const conditions: string[] = [];
  const parameters: (string | number)[] = [];
  if (filters.type && filters.type !== 'all') {
    conditions.push('type = ?');
    parameters.push(filters.type);
  }
  if (filters.accountId) {
    conditions.push('(account_id = ? OR destination_account_id = ?)');
    parameters.push(filters.accountId, filters.accountId);
  }
  if (filters.startIso) {
    conditions.push('occurred_at >= ?');
    parameters.push(filters.startIso);
  }
  if (filters.endIso) {
    conditions.push('occurred_at < ?');
    parameters.push(filters.endIso);
  }
  const search = filters.searchText?.trim();
  if (search) {
    // Treat %, _ and backslash literally, and bind all user input.
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const columns = ['merchant', 'note', 'category_name', 'account_name', 'destination_account_name'];
    conditions.push(`(${columns.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    parameters.push(...columns.map(() => pattern));
  }
  if (options.cursor) {
    const cursor = options.cursor;
    if (!cursor.id || !['transaction', 'transfer'].includes(cursor.kind) ||
        !Number.isFinite(Date.parse(cursor.occurredAt)) || !Number.isFinite(Date.parse(cursor.createdAt))) {
      throw new ValidationError('Invalid activity page cursor. Refresh the list.');
    }
    // Tie-breakers prevent equal timestamps (including transaction/transfer ID
    // collisions) from repeating or disappearing at a page boundary.
    conditions.push('(occurred_at, created_at, kind, id) < (?, ?, ?, ?)');
    parameters.push(cursor.occurredAt, cursor.createdAt, cursor.kind, cursor.id);
  }
  if (options.limit !== undefined) parameters.push(options.limit);
  return db.getAllAsync<ActivityRow>(
    `WITH activity AS (
      SELECT 'transaction' AS kind, t.id, t.type,
        t.account_id, a.name AS account_name,
        NULL AS destination_account_id, NULL AS destination_account_name,
        t.amount_minor, t.currency,
        NULL AS destination_amount_minor, NULL AS destination_currency,
        t.category_id, c.name AS category_name, c.icon AS category_icon,
        t.merchant, t.note, t.exchange_rate_lbp_per_usd,
        t.occurred_at, t.created_at, t.updated_at
      FROM transactions t
      INNER JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
      UNION ALL
      SELECT 'transfer' AS kind, t.id, 'transfer' AS type,
        t.source_account_id, a.name,
        t.destination_account_id, b.name,
        t.source_amount_minor, t.source_currency,
        t.destination_amount_minor, t.destination_currency,
        NULL, NULL, NULL, NULL, t.note, t.exchange_rate_lbp_per_usd,
        t.occurred_at, t.created_at, t.updated_at
      FROM transfers t
      INNER JOIN accounts a ON a.id = t.source_account_id
      INNER JOIN accounts b ON b.id = t.destination_account_id
    )
    SELECT * FROM activity
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY occurred_at DESC, created_at DESC, kind DESC, id DESC
    ${options.limit === undefined ? '' : 'LIMIT ?'}`,
    ...parameters
  );
}
