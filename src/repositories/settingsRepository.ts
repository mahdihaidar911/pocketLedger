import type { SQLiteDatabase } from 'expo-sqlite';
import { isAppearancePreference, type AppearancePreference } from '../theme/appearance';
import { ValidationError } from '../utils/errors';

const APPEARANCE_KEY = 'appearance_preference';

export async function getAppearancePreference(db: SQLiteDatabase): Promise<AppearancePreference> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ? LIMIT 1', APPEARANCE_KEY
  );
  return isAppearancePreference(row?.value) ? row.value : 'system';
}

export async function setAppearancePreference(db: SQLiteDatabase, preference: AppearancePreference): Promise<void> {
  if (!isAppearancePreference(preference)) throw new ValidationError('Choose System, Light, or Dark.');
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    APPEARANCE_KEY, preference, new Date().toISOString()
  );
}

const RECURRING_REMINDERS_KEY =
  'recurring_reminders_enabled';

export async function getRecurringRemindersEnabled(
  db: SQLiteDatabase
): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    `
      SELECT value
      FROM app_settings
      WHERE key = ?
      LIMIT 1
    `,
    RECURRING_REMINDERS_KEY
  );

  return row?.value === '1';
}

export async function setRecurringRemindersEnabled(
  db: SQLiteDatabase,
  enabled: boolean
): Promise<void> {
  await db.runAsync(
    `
      INSERT INTO app_settings (
        key,
        value,
        updated_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    RECURRING_REMINDERS_KEY,
    enabled ? '1' : '0',
    new Date().toISOString()
  );
}

// ─── Daily reminder ───────────────────────────────────────────────────────────

const DAILY_REMINDER_ENABLED_KEY = 'daily_reminder_enabled';
const DAILY_REMINDER_HOUR_KEY = 'daily_reminder_hour';

export async function getDailyReminderEnabled(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ? LIMIT 1',
    DAILY_REMINDER_ENABLED_KEY
  );
  return row?.value === '1';
}

export async function setDailyReminderEnabled(db: SQLiteDatabase, enabled: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    DAILY_REMINDER_ENABLED_KEY, enabled ? '1' : '0', new Date().toISOString()
  );
}

/**
 * Returns the hour (0–23) at which the daily reminder fires.
 * Defaults to 21 (9 PM) if not yet configured.
 */
export async function getDailyReminderHour(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ? LIMIT 1',
    DAILY_REMINDER_HOUR_KEY
  );
  const parsed = parseInt(row?.value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 21;
}

export async function setDailyReminderHour(db: SQLiteDatabase, hour: number): Promise<void> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new ValidationError('Hour must be between 0 and 23.');
  }
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    DAILY_REMINDER_HOUR_KEY, String(hour), new Date().toISOString()
  );
}

// ─── Weekly summary ───────────────────────────────────────────────────────────

const WEEKLY_SUMMARY_ENABLED_KEY = 'weekly_summary_enabled';

export async function getWeeklySummaryEnabled(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ? LIMIT 1',
    WEEKLY_SUMMARY_ENABLED_KEY
  );
  return row?.value === '1';
}

export async function setWeeklySummaryEnabled(db: SQLiteDatabase, enabled: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    WEEKLY_SUMMARY_ENABLED_KEY, enabled ? '1' : '0', new Date().toISOString()
  );
}

// ─── Low-balance alerts ───────────────────────────────────────────────────────

const LOW_BALANCE_ALERTS_KEY = 'low_balance_alerts_enabled';

export async function getLowBalanceAlertsEnabled(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ? LIMIT 1',
    LOW_BALANCE_ALERTS_KEY
  );
  return row?.value === '1';
}

export async function setLowBalanceAlertsEnabled(db: SQLiteDatabase, enabled: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    LOW_BALANCE_ALERTS_KEY, enabled ? '1' : '0', new Date().toISOString()
  );
}
