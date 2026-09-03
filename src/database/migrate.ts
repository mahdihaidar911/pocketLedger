import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 10;

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const result = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version');

  let currentVersion =
    result?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  // Version 1
  // Accounts
  if (currentVersion === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        currency TEXT NOT NULL,

        balance_minor INTEGER NOT NULL DEFAULT 0,

        low_balance_threshold_minor INTEGER,

        icon TEXT,

        is_active INTEGER NOT NULL DEFAULT 1,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    currentVersion = 1;
  }

  // Version 2
  // Categories + Transactions
  if (currentVersion === 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,

        name TEXT NOT NULL,

        kind TEXT NOT NULL
          CHECK (kind IN ('expense', 'income')),

        icon TEXT,

        is_default INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        UNIQUE(kind, name)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,

        type TEXT NOT NULL
          CHECK (type IN ('expense', 'income')),

        account_id TEXT NOT NULL,
        category_id TEXT,

        amount_minor INTEGER NOT NULL
          CHECK (amount_minor > 0),

        currency TEXT NOT NULL
          CHECK (currency IN ('USD', 'LBP')),

        merchant TEXT,
        note TEXT,

        occurred_at TEXT NOT NULL,

        exchange_rate_lbp_per_usd INTEGER,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        FOREIGN KEY (account_id)
          REFERENCES accounts(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (category_id)
          REFERENCES categories(id)
          ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS
        idx_transactions_account
        ON transactions(account_id);

      CREATE INDEX IF NOT EXISTS
        idx_transactions_occurred_at
        ON transactions(occurred_at);

      CREATE INDEX IF NOT EXISTS
        idx_transactions_type
        ON transactions(type);


      INSERT OR IGNORE INTO categories
      (
        id,
        name,
        kind,
        icon,
        is_default,
        is_active,
        created_at,
        updated_at
      )
      VALUES

      (
        'expense-food-dining',
        'Food & Dining',
        'expense',
        'restaurant-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-groceries',
        'Groceries',
        'expense',
        'basket-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-fuel',
        'Fuel',
        'expense',
        'car-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-transportation',
        'Transportation',
        'expense',
        'bus-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-shopping',
        'Shopping',
        'expense',
        'bag-handle-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-bills',
        'Bills',
        'expense',
        'receipt-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-phone-internet',
        'Phone & Internet',
        'expense',
        'phone-portrait-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-entertainment',
        'Entertainment',
        'expense',
        'game-controller-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-health',
        'Health',
        'expense',
        'medkit-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-education',
        'Education',
        'expense',
        'school-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-personal-care',
        'Personal Care',
        'expense',
        'person-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-subscriptions',
        'Subscriptions',
        'expense',
        'repeat-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-family',
        'Family',
        'expense',
        'people-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-gifts',
        'Gifts',
        'expense',
        'gift-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-travel',
        'Travel',
        'expense',
        'airplane-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-maintenance',
        'Maintenance',
        'expense',
        'construct-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'expense-other',
        'Other',
        'expense',
        'ellipsis-horizontal-circle-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),


      (
        'income-salary',
        'Salary',
        'income',
        'cash-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'income-freelance',
        'Freelance',
        'income',
        'laptop-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'income-gift',
        'Gift',
        'income',
        'gift-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'income-refund',
        'Refund',
        'income',
        'return-down-back-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'income-business',
        'Business',
        'income',
        'briefcase-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      ),

      (
        'income-other',
        'Other',
        'income',
        'ellipsis-horizontal-circle-outline',
        1,
        1,
        datetime('now'),
        datetime('now')
      );
    `);

    currentVersion = 2;
  }
// Version 3
// Transfers
if (currentVersion === 2) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY NOT NULL,

      source_account_id TEXT NOT NULL,
      destination_account_id TEXT NOT NULL,

      source_amount_minor INTEGER NOT NULL
        CHECK (source_amount_minor > 0),

      destination_amount_minor INTEGER NOT NULL
        CHECK (destination_amount_minor > 0),

      source_currency TEXT NOT NULL
        CHECK (source_currency IN ('USD', 'LBP')),

      destination_currency TEXT NOT NULL
        CHECK (destination_currency IN ('USD', 'LBP')),

      exchange_rate_lbp_per_usd INTEGER,

      note TEXT,

      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (source_account_id)
        REFERENCES accounts(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (destination_account_id)
        REFERENCES accounts(id)
        ON DELETE RESTRICT,

      CHECK (
        source_account_id <> destination_account_id
      )
    );

    CREATE INDEX IF NOT EXISTS
      idx_transfers_source_account
      ON transfers(source_account_id);

    CREATE INDEX IF NOT EXISTS
      idx_transfers_destination_account
      ON transfers(destination_account_id);

    CREATE INDEX IF NOT EXISTS
      idx_transfers_occurred_at
      ON transfers(occurred_at);
  `);

  currentVersion = 3;
}
// Version 4
// Repair/ensure Transfers table exists
if (currentVersion === 3) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY NOT NULL,

      source_account_id TEXT NOT NULL,
      destination_account_id TEXT NOT NULL,

      source_amount_minor INTEGER NOT NULL
        CHECK (source_amount_minor > 0),

      destination_amount_minor INTEGER NOT NULL
        CHECK (destination_amount_minor > 0),

      source_currency TEXT NOT NULL
        CHECK (source_currency IN ('USD', 'LBP')),

      destination_currency TEXT NOT NULL
        CHECK (destination_currency IN ('USD', 'LBP')),

      exchange_rate_lbp_per_usd INTEGER,

      note TEXT,

      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (source_account_id)
        REFERENCES accounts(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (destination_account_id)
        REFERENCES accounts(id)
        ON DELETE RESTRICT,

      CHECK (
        source_account_id <> destination_account_id
      )
    );

    CREATE INDEX IF NOT EXISTS
      idx_transfers_source_account
      ON transfers(source_account_id);

    CREATE INDEX IF NOT EXISTS
      idx_transfers_destination_account
      ON transfers(destination_account_id);

    CREATE INDEX IF NOT EXISTS
      idx_transfers_occurred_at
      ON transfers(occurred_at);
  `);

  currentVersion = 4;
}
// Version 5
// Exchange-rate history
if (currentVersion === 4) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY NOT NULL,

      lbp_per_usd INTEGER NOT NULL
        CHECK (lbp_per_usd > 0),

      effective_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS
      idx_exchange_rates_effective_at
      ON exchange_rates(effective_at DESC);
  `);

  currentVersion = 5;
}
// Version 6
// Savings goals
if (currentVersion === 5) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY NOT NULL,

      name TEXT NOT NULL,

      account_id TEXT NOT NULL UNIQUE,

      target_amount_minor INTEGER NOT NULL
        CHECK (target_amount_minor > 0),

      currency TEXT NOT NULL
        CHECK (currency IN ('USD', 'LBP')),

      target_date TEXT,

      icon TEXT,

      is_completed INTEGER NOT NULL DEFAULT 0,

      is_active INTEGER NOT NULL DEFAULT 1,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (account_id)
        REFERENCES accounts(id)
        ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS
      idx_savings_goals_account
      ON savings_goals(account_id);

    CREATE INDEX IF NOT EXISTS
      idx_savings_goals_active
      ON savings_goals(is_active);
  `);

  currentVersion = 6;
}
// Version 7
// Recurring payments
if (currentVersion === 6) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS recurring_payments (
      id TEXT PRIMARY KEY NOT NULL,

      name TEXT NOT NULL,

      type TEXT NOT NULL
        CHECK (type IN ('expense', 'income')),

      account_id TEXT NOT NULL,
      category_id TEXT,

      amount_minor INTEGER NOT NULL
        CHECK (amount_minor > 0),

      currency TEXT NOT NULL
        CHECK (currency IN ('USD', 'LBP')),

      frequency TEXT NOT NULL
        CHECK (
          frequency IN (
            'daily',
            'weekly',
            'monthly',
            'yearly'
          )
        ),

      interval_count INTEGER NOT NULL DEFAULT 1
        CHECK (interval_count > 0),

      start_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,

      end_date TEXT,

      merchant TEXT,
      note TEXT,

      is_active INTEGER NOT NULL DEFAULT 1,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (account_id)
        REFERENCES accounts(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS
      idx_recurring_payments_next_due
      ON recurring_payments(next_due_date);

    CREATE INDEX IF NOT EXISTS
      idx_recurring_payments_account
      ON recurring_payments(account_id);

    CREATE INDEX IF NOT EXISTS
      idx_recurring_payments_active
      ON recurring_payments(is_active);
  `);

  currentVersion = 7;
}

// Version 8
// App preferences
if (currentVersion === 7) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO app_settings (
      key,
      value,
      updated_at
    )
    VALUES (
      'recurring_reminders_enabled',
      '0',
      datetime('now')
    );
  `);

  currentVersion = 8;
}
// Version 9: monthly budgets. Existing financial tables are untouched.
if (currentVersion === 8) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      CREATE TABLE IF NOT EXISTS monthly_budgets (
        id TEXT PRIMARY KEY NOT NULL,
        month TEXT NOT NULL CHECK (
          month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND substr(month, 1, 4) BETWEEN '0001' AND '9998'
          AND substr(month, 6, 2) BETWEEN '01' AND '12'
        ),
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        currency TEXT NOT NULL CHECK (currency IN ('USD', 'LBP')),
        limit_minor INTEGER NOT NULL CHECK (
          typeof(limit_minor) = 'integer' AND limit_minor > 0
          AND limit_minor <= 9007199254740991
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(month, category_id, currency)
      );
      PRAGMA user_version = 9;
    `);
  });
  currentVersion = 9;
}
// Version 10: additional notification settings keys.
if (currentVersion === 9) {
  await db.execAsync(`
    INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
      ('daily_reminder_enabled', '0', datetime('now')),
      ('daily_reminder_hour',    '21', datetime('now')),
      ('weekly_summary_enabled', '0', datetime('now')),
      ('low_balance_alerts_enabled', '0', datetime('now'));
    PRAGMA user_version = 10;
  `);
  currentVersion = 10;
}

  await db.execAsync(
    `PRAGMA user_version = ${DATABASE_VERSION}`
  );
}
