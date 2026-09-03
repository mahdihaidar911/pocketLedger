/**
 * notificationService
 *
 * Handles three notification types beyond recurring-payment reminders:
 *
 *   1. Daily expense-entry reminder  — fires at a user-configured hour every day.
 *   2. Weekly spending summary       — fires every Sunday at 8 PM.
 *   3. Low-balance alert             — immediate (non-scheduled) notification
 *      fired after a transaction when an account drops below its threshold.
 *
 * All scheduled notifications use a unique identifier prefix so they can be
 * cancelled and rescheduled atomically without touching unrelated notifications.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getAccountById } from '../repositories/accountRepository';
import {
  getDailyReminderEnabled,
  getDailyReminderHour,
  getWeeklySummaryEnabled,
  getLowBalanceAlertsEnabled,
} from '../repositories/settingsRepository';
import { formatMoney } from '../utils';
import { getReminderPermissionGranted } from './recurringReminderService';

// ─── Notification identifier prefixes ────────────────────────────────────────

const DAILY_REMINDER_ID = 'dailyfinance-daily-reminder';
const WEEKLY_SUMMARY_ID = 'dailyfinance-weekly-summary';
const DAILY_CHANNEL_ID = 'daily-reminders';
const WEEKLY_CHANNEL_ID = 'weekly-summary';

// ─── Android channel setup ────────────────────────────────────────────────────

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
    name: 'Daily expense reminder',
    description: 'Reminds you to log your expenses for the day.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(WEEKLY_CHANNEL_ID, {
    name: 'Weekly spending summary',
    description: 'A brief summary of your spending each week.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

// ─── Daily reminder ───────────────────────────────────────────────────────────

/**
 * Cancels and optionally reschedules the daily expense reminder.
 * Safe to call any time settings change.
 */
export async function syncDailyReminder(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;

  // Always cancel the existing one first.
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(
    () => undefined // ignore if it wasn't scheduled
  );

  const enabled = await getDailyReminderEnabled(db);
  if (!enabled || !(await getReminderPermissionGranted())) return;

  await ensureAndroidChannels();

  const hour = await getDailyReminderHour(db);

  // CalendarTrigger fires at the same time every day.
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: "Don't forget your expenses",
      body: "Tap to log today's transactions in PocketLedger.",
      sound: 'default',
      data: { kind: 'daily-reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      channelId: DAILY_CHANNEL_ID,
    },
  });
}

// ─── Weekly summary ───────────────────────────────────────────────────────────

/**
 * Cancels and optionally reschedules the weekly spending summary.
 * Fires every Sunday at 20:00 (8 PM).
 */
export async function syncWeeklySummary(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID).catch(
    () => undefined
  );

  const enabled = await getWeeklySummaryEnabled(db);
  if (!enabled || !(await getReminderPermissionGranted())) return;

  await ensureAndroidChannels();

  // WeeklyTrigger: weekday 1 = Sunday (Expo uses 1-indexed, Sunday = 1).
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_SUMMARY_ID,
    content: {
      title: 'Weekly spending summary',
      body: 'Check your PocketLedger report to see how this week went.',
      sound: 'default',
      data: { kind: 'weekly-summary' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Sunday
      hour: 20,
      minute: 0,
      channelId: WEEKLY_CHANNEL_ID,
    },
  });
}

// ─── Low-balance alert ────────────────────────────────────────────────────────

/**
 * Fires an immediate notification if the given account has dropped below its
 * configured low-balance threshold. This is called after every transaction write.
 *
 * The notification is immediate (no trigger delay) and does not persist in the
 * scheduled list — it fires once and is gone.
 */
export async function checkAndFireLowBalanceAlert(
  db: SQLiteDatabase,
  accountId: string
): Promise<void> {
  if (Platform.OS === 'web') return;

  const [alertsEnabled, permissionGranted] = await Promise.all([
    getLowBalanceAlertsEnabled(db),
    getReminderPermissionGranted(),
  ]);

  if (!alertsEnabled || !permissionGranted) return;

  const account = await getAccountById(db, accountId);
  if (!account) return;

  // No threshold configured — nothing to check.
  if (account.lowBalanceThresholdMinor === null) return;

  // Balance is still above threshold — no alert needed.
  if (account.balanceMinor > account.lowBalanceThresholdMinor) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('low-balance-alerts', {
      name: 'Low balance alerts',
      description: 'Alerts when an account balance drops below your threshold.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const balanceText = formatMoney(account.balanceMinor, account.currency);
  const thresholdText = formatMoney(account.lowBalanceThresholdMinor, account.currency);

  await Notifications.scheduleNotificationAsync({
    // Use a per-account identifier so repeated dips don't stack duplicates.
    identifier: `dailyfinance-low-balance-${account.id}`,
    content: {
      title: `Low balance: ${account.name}`,
      body: `Balance is ${balanceText}, below your ${thresholdText} alert threshold.`,
      sound: 'default',
      data: { kind: 'low-balance', accountId: account.id },
    },
    trigger: null, // immediate
  });
}

// ─── Sync all ─────────────────────────────────────────────────────────────────

/**
 * Re-syncs both scheduled notification types. Call this once on app start
 * (after the database is ready) and whenever the user changes settings.
 */
export async function syncAllScheduledNotifications(db: SQLiteDatabase): Promise<void> {
  await Promise.all([
    syncDailyReminder(db),
    syncWeeklySummary(db),
  ]);
}
