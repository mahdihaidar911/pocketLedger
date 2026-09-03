import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Screen } from '../../components';
import {
  getDailyReminderEnabled,
  getDailyReminderHour,
  getRecurringRemindersEnabled,
  getWeeklySummaryEnabled,
  getLowBalanceAlertsEnabled,
  setDailyReminderEnabled,
  setDailyReminderHour,
  setRecurringRemindersEnabled,
  setWeeklySummaryEnabled,
  setLowBalanceAlertsEnabled,
} from '../../repositories/settingsRepository';
import {
  getReminderPermissionGranted,
  requestReminderPermission,
  syncRecurringReminders,
  syncDailyReminder,
  syncWeeklySummary,
} from '../../services';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPrefs {
  recurring: boolean;
  daily: boolean;
  dailyHour: number;
  weekly: boolean;
  lowBalance: boolean;
}

// ─── Hour display helper ──────────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

// ─── Time picker options ──────────────────────────────────────────────────────

// Show morning (6–11), afternoon (12–17), and evening (18–23) options.
const HOUR_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db = useSQLiteContext();

  const [prefs, setPrefs] = useState<NotificationPrefs>({
    recurring: false,
    daily: false,
    dailyHour: 21,
    weekly: false,
    lowBalance: false,
  });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showHourPicker, setShowHourPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [recurring, daily, dailyHour, weekly, lowBalance, permission] =
        await Promise.all([
          getRecurringRemindersEnabled(db),
          getDailyReminderEnabled(db),
          getDailyReminderHour(db),
          getWeeklySummaryEnabled(db),
          getLowBalanceAlertsEnabled(db),
          getReminderPermissionGranted(),
        ]);
      setPrefs({ recurring, daily, dailyHour, weekly, lowBalance });
      setPermissionGranted(permission);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => void load(), [load]));

  // ─── Generic toggle handler ─────────────────────────────────────────────────

  async function handleToggle(
    key: keyof Omit<NotificationPrefs, 'dailyHour'>,
    nextValue: boolean
  ) {
    if (working || Platform.OS === 'web') return;

    try {
      setWorking(true);

      if (nextValue && !permissionGranted) {
        const granted = await requestReminderPermission();
        setPermissionGranted(granted);
        if (!granted) {
          Alert.alert(
            'Notifications are disabled',
            'Allow notifications in your device settings to receive reminders.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => void Linking.openSettings() },
            ]
          );
          return;
        }
      }

      const nextPrefs = { ...prefs, [key]: nextValue };
      setPrefs(nextPrefs);

      switch (key) {
        case 'recurring':
          await setRecurringRemindersEnabled(db, nextValue);
          await syncRecurringReminders(db);
          break;
        case 'daily':
          await setDailyReminderEnabled(db, nextValue);
          await syncDailyReminder(db);
          break;
        case 'weekly':
          await setWeeklySummaryEnabled(db, nextValue);
          await syncWeeklySummary(db);
          break;
        case 'lowBalance':
          await setLowBalanceAlertsEnabled(db, nextValue);
          // Low-balance alerts are immediate (no scheduling needed).
          break;
      }
    } catch (error) {
      console.error('Failed to update notification setting:', error);
      Alert.alert('Unable to update setting', 'Something went wrong.');
      await load(); // revert UI to actual DB state
    } finally {
      setWorking(false);
    }
  }

  // ─── Hour picker ────────────────────────────────────────────────────────────

  async function handleSelectHour(hour: number) {
    setShowHourPicker(false);
    if (hour === prefs.dailyHour) return;
    try {
      setWorking(true);
      setPrefs((p) => ({ ...p, dailyHour: hour }));
      await setDailyReminderHour(db, hour);
      if (prefs.daily) await syncDailyReminder(db);
    } catch (error) {
      console.error('Failed to save reminder hour:', error);
      await load();
    } finally {
      setWorking(false);
    }
  }

  const unavailable = Platform.OS === 'web';
  const anyEnabled =
    prefs.recurring || prefs.daily || prefs.weekly || prefs.lowBalance;

  return (
    <Screen scroll contentStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={23} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Status card */}
      <Card style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <Ionicons
            name={anyEnabled ? 'notifications' : 'notifications-off-outline'}
            size={25}
            color={anyEnabled ? colors.primary : colors.textMuted}
          />
        </View>
        <Text style={styles.statusTitle}>Notifications</Text>
        <Text style={styles.statusValue}>
          {loading
            ? 'Loading…'
            : unavailable
              ? 'Available on iOS and Android'
              : !permissionGranted && anyEnabled
                ? 'Device permission required'
                : anyEnabled
                  ? 'Active'
                  : 'All off'}
        </Text>
      </Card>

      {/* Recurring reminders */}
      <Card style={styles.preferenceCard}>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceLeft}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="repeat-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Due-date reminders</Text>
              <Text style={styles.preferenceDescription}>
                Reminder at 9:00 AM when a recurring payment or income is due.
              </Text>
            </View>
          </View>
          <Switch
            value={prefs.recurring && permissionGranted}
            disabled={loading || working || unavailable}
            onValueChange={(v) => void handleToggle('recurring', v)}
            trackColor={{ false: colors.border, true: colors.switchTrack }}
            thumbColor={prefs.recurring ? colors.primary : colors.surface}
          />
        </View>
      </Card>

      {/* Daily reminder */}
      <Card style={styles.preferenceCard}>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceLeft}>
            <View style={[styles.iconBadge, { backgroundColor: colors.warning + '18' }]}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
            </View>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Daily expense reminder</Text>
              <Text style={styles.preferenceDescription}>
                Reminds you to log your daily transactions.
              </Text>
            </View>
          </View>
          <Switch
            value={prefs.daily && permissionGranted}
            disabled={loading || working || unavailable}
            onValueChange={(v) => void handleToggle('daily', v)}
            trackColor={{ false: colors.border, true: colors.switchTrack }}
            thumbColor={prefs.daily ? colors.primary : colors.surface}
          />
        </View>

        {/* Time picker row — only shown when daily reminder is on */}
        {prefs.daily && permissionGranted && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Reminder time</Text>
            <Pressable
              style={styles.timeButton}
              onPress={() => setShowHourPicker((v) => !v)}
              disabled={working}
            >
              <Text style={styles.timeValue}>{formatHour(prefs.dailyHour)}</Text>
              <Ionicons
                name={showHourPicker ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.primary}
              />
            </Pressable>
          </View>
        )}

        {/* Hour picker grid */}
        {showHourPicker && (
          <View style={styles.hourGrid}>
            {HOUR_OPTIONS.map((h) => (
              <Pressable
                key={h}
                style={[
                  styles.hourChip,
                  h === prefs.dailyHour && styles.hourChipSelected,
                ]}
                onPress={() => void handleSelectHour(h)}
              >
                <Text
                  style={[
                    styles.hourChipText,
                    h === prefs.dailyHour && { color: colors.textInverse },
                  ]}
                >
                  {formatHour(h)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      {/* Weekly summary */}
      <Card style={styles.preferenceCard}>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceLeft}>
            <View style={[styles.iconBadge, { backgroundColor: colors.success + '18' }]}>
              <Ionicons name="bar-chart-outline" size={18} color={colors.success} />
            </View>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Weekly spending summary</Text>
              <Text style={styles.preferenceDescription}>
                Brief summary every Sunday at 8:00 PM.
              </Text>
            </View>
          </View>
          <Switch
            value={prefs.weekly && permissionGranted}
            disabled={loading || working || unavailable}
            onValueChange={(v) => void handleToggle('weekly', v)}
            trackColor={{ false: colors.border, true: colors.switchTrack }}
            thumbColor={prefs.weekly ? colors.primary : colors.surface}
          />
        </View>
      </Card>

      {/* Low-balance alerts */}
      <Card style={styles.preferenceCard}>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceLeft}>
            <View style={[styles.iconBadge, { backgroundColor: colors.danger + '18' }]}>
              <Ionicons name="warning-outline" size={18} color={colors.danger} />
            </View>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Low-balance alerts</Text>
              <Text style={styles.preferenceDescription}>
                Alert when an account drops below its configured threshold. Set thresholds in account settings.
              </Text>
            </View>
          </View>
          <Switch
            value={prefs.lowBalance && permissionGranted}
            disabled={loading || working || unavailable}
            onValueChange={(v) => void handleToggle('lowBalance', v)}
            trackColor={{ false: colors.border, true: colors.switchTrack }}
            thumbColor={prefs.lowBalance ? colors.primary : colors.surface}
          />
        </View>
      </Card>

      {/* Permission banner */}
      {!permissionGranted && !unavailable && anyEnabled && (
        <Pressable
          style={styles.permissionBanner}
          onPress={() => void Linking.openSettings()}
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.permissionBannerText}>
            Notification permission is required. Tap to open Settings.
          </Text>
        </Pressable>
      )}

      <Text style={styles.helper}>
        Reminders are scheduled locally on this device and do not require an internet connection.
      </Text>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((colors) =>
  StyleSheet.create({
    content: { paddingBottom: 60 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xxxl,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
    headerSpacer: { width: 42 },

    statusCard: { alignItems: 'center', marginBottom: spacing.xxl },
    statusIcon: {
      width: 54,
      height: 54,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    statusTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    statusValue: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },

    preferenceCard: { marginBottom: spacing.lg },
    preferenceRow: { flexDirection: 'row', alignItems: 'center' },
    preferenceLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingRight: spacing.lg },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
      flexShrink: 0,
    },
    preferenceText: { flex: 1 },
    preferenceTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    preferenceDescription: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing.xs,
    },

    // Time picker
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    timeLabel: { color: colors.textSecondary, fontSize: 13 },
    timeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.background,
    },
    timeValue: { color: colors.primary, fontSize: 14, fontWeight: '600' },

    hourGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    hourChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hourChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    hourChipText: { color: colors.text, fontSize: 12, fontWeight: '500' },

    permissionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.warning + '15',
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    permissionBannerText: {
      flex: 1,
      color: colors.warning,
      fontSize: 12,
      lineHeight: 17,
    },

    helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  })
);
