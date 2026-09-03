import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getRecurringPayments } from '../repositories/recurringPaymentRepository';
import { getRecurringRemindersEnabled } from '../repositories/settingsRepository';
import { formatMoney } from '../utils';

const CHANNEL_ID = 'recurring-reminders';
const REMINDER_KIND = 'recurring-payment';
const REMINDER_HOUR = 9;
const MAX_SCHEDULED_REMINDERS = 50;

export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await configureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
    },
  });

  return requested.granted;
}

export async function getReminderPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function syncRecurringReminders(
  db: SQLiteDatabase
): Promise<void> {
  if (Platform.OS === 'web') return;

  await cancelPocketLedgerReminders();

  const enabled = await getRecurringRemindersEnabled(db);
  if (!enabled || !(await getReminderPermissionGranted())) return;

  await configureAndroidChannel();

  const items = await getRecurringPayments(db);

  for (const item of items.slice(0, MAX_SCHEDULED_REMINDERS)) {
    if (item.endDate && item.nextDueDate > item.endDate) continue;

    const triggerDate = getReminderDate(item.nextDueDate);
    if (!triggerDate || triggerDate.getTime() <= Date.now()) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `dailyfinance-recurring-${item.id}`,
      content: {
        title: item.type === 'expense' ? 'Payment due today' : 'Income due today',
        body: `${item.name} · ${formatMoney(item.amountMinor, item.currency)}`,
        sound: 'default',
        data: {
          kind: REMINDER_KIND,
          recurringId: item.id,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: CHANNEL_ID,
      },
    });
  }
}

async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Recurring payment reminders',
    description: 'Bills and income scheduled in PocketLedger',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 250, 150, 250],
  });
}

async function cancelPocketLedgerReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  await Promise.all(
    scheduled
      .filter((notification) =>
        notification.content.data?.kind === REMINDER_KIND
      )
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(
          notification.identifier
        )
      )
  );
}

function getReminderDate(dateOnly: string): Date | null {
  const [yearValue, monthValue, dayValue] = dateOnly.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day, REMINDER_HOUR, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}
