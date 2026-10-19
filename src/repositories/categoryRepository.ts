import * as Crypto from 'expo-crypto';

import type {
    SQLiteDatabase,
} from 'expo-sqlite';

import type {
    Category,
    CategoryKind,
    CreateCategoryInput,
    UpdateCategoryInput,
} from '../types';
import { ValidationError } from '../utils/errors';

type CategoryRow = {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function mapCategoryRow(
  row: CategoryRow
): Category {
  return {
    id: row.id,

    name: row.name,

    kind: row.kind as CategoryKind,

    icon: row.icon,

    isDefault:
      row.is_default === 1,

    isActive:
      row.is_active === 1,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  };
}

export async function getCategories(
  db: SQLiteDatabase,
  kind: CategoryKind
): Promise<Category[]> {
  const rows =
    await db.getAllAsync<CategoryRow>(
      `
        SELECT
          id,
          name,
          kind,
          icon,
          is_default,
          is_active,
          created_at,
          updated_at

        FROM categories

        WHERE
          kind = ?
          AND is_active = 1

        ORDER BY
          is_default DESC,
          name ASC
      `,
      kind
    );

  return rows.map(mapCategoryRow);
}

export async function getAllCategories(
  db: SQLiteDatabase,
  kind: CategoryKind
): Promise<Category[]> {
  const rows = await db.getAllAsync<CategoryRow>(
    `
      SELECT
        id,
        name,
        kind,
        icon,
        is_default,
        is_active,
        created_at,
        updated_at
      FROM categories
      WHERE kind = ?
      ORDER BY
        is_active DESC,
        is_default DESC,
        name COLLATE NOCASE ASC
    `,
    kind
  );

  return rows.map(mapCategoryRow);
}

export async function createCategory(
  db: SQLiteDatabase,
  input: CreateCategoryInput
): Promise<Category> {
  const name = validateCategoryName(input.name);
  if (input.kind !== 'expense' && input.kind !== 'income') {
    throw new ValidationError('Choose expense or income.');
  }

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const icon = input.icon?.trim() || null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await ensureNameAvailable(txn, input.kind, name);
    await txn.runAsync(
      `
        INSERT INTO categories (
          id,
          name,
          kind,
          icon,
          is_default,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 1, ?, ?)
      `,
      id,
      name,
      input.kind,
      icon,
      now,
      now
    );
  });

  return {
    id,
    name,
    kind: input.kind,
    icon,
    isDefault: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getCategoryById(
  db: SQLiteDatabase,
  id: string
): Promise<Category | null> {
  const row = await db.getFirstAsync<CategoryRow>(
    `
      SELECT id, name, kind, icon, is_default, is_active, created_at, updated_at
      FROM categories
      WHERE id = ?
      LIMIT 1
    `,
    id
  );
  return row ? mapCategoryRow(row) : null;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: string,
  input: UpdateCategoryInput
): Promise<void> {
  const name = validateCategoryName(input.name);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const category = await getCategoryById(txn, id);
    if (!category) throw new ValidationError('Category not found.');

    await ensureNameAvailable(txn, category.kind, name, id);
    await txn.runAsync(
      `
        UPDATE categories
        SET name = ?, icon = ?, updated_at = ?
        WHERE id = ?
      `,
      name,
      input.icon?.trim() || null,
      new Date().toISOString(),
      id
    );
  });
}

function validateCategoryName(value: string): string {
  const name = value.trim();
  if (!name) throw new ValidationError('Category name is required.');
  if (name.length > 40) {
    throw new ValidationError('Category name must be 40 characters or fewer.');
  }
  return name;
}

async function ensureNameAvailable(
  db: SQLiteDatabase,
  kind: CategoryKind,
  name: string,
  excludingId = ''
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string; is_active: number }>(
    `
      SELECT id, is_active FROM categories
      WHERE kind = ? AND name = ? COLLATE NOCASE AND id <> ?
      LIMIT 1
    `,
    kind,
    name,
    excludingId
  );
  if (existing) {
    throw new ValidationError(
      existing.is_active === 1
        ? 'A category with this name already exists.'
        : 'An inactive category with this name already exists. Reactivate it instead.'
    );
  }
}

export async function setCategoryActive(
  db: SQLiteDatabase,
  id: string,
  isActive: boolean
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const category = await txn.getFirstAsync<{
      kind: string;
      is_active: number;
    }>(
      `
        SELECT kind, is_active
        FROM categories
        WHERE id = ?
        LIMIT 1
      `,
      id
    );

    if (!category) {
      throw new ValidationError('Category not found.');
    }

    if ((category.is_active === 1) === isActive) return;

    if (!isActive) {
      const activeCount = await txn.getFirstAsync<{ count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM categories
          WHERE
            kind = ?
            AND is_active = 1
        `,
        category.kind
      );

      if ((activeCount?.count ?? 0) <= 1) {
        throw new ValidationError('Keep at least one active category for this type.');
      }

      const recurringCount = await txn.getFirstAsync<{ count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM recurring_payments
          WHERE
            category_id = ?
            AND is_active = 1
        `,
        id
      );

      if ((recurringCount?.count ?? 0) > 0) {
        throw new ValidationError(
          'This category is used by an active recurring payment. Change or pause that item first.'
        );
      }
    }

    await txn.runAsync(
      `
        UPDATE categories
        SET
          is_active = ?,
          updated_at = ?
        WHERE id = ?
      `,
      isActive ? 1 : 0,
      new Date().toISOString(),
      id
    );
  });
}
