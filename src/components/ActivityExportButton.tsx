/**
 * ActivityExportButton
 *
 * Offers CSV, PDF, and Excel export via an action sheet.
 * The caller provides getFilters(); the activity repository loads
 * every matching row, not only the current page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { exportActivityCsv } from '../services/activityCsvExportService';
import { exportActivityPdf, exportActivityXlsx } from '../services/reportExportService';
import { getActivityForExport } from '../repositories/activityRepository';
import type { ActivityFilters } from '../types';
import { createThemedStyles, useTheme, radius, spacing } from '../theme';
import { logUnexpectedError } from '../utils/errors';

type ExportFormat = 'csv' | 'pdf' | 'xlsx';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV (.csv)',
  pdf: 'PDF Report (.pdf)',
  xlsx: 'Excel Spreadsheet (.xlsx)',
};

export function ActivityExportButton({
  disabled,
  getFilters,
  selectionKey,
}: {
  disabled: boolean;
  getFilters: () => ActivityFilters | null;
  selectionKey: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const db = useSQLiteContext();

  const [working, setWorking] = useState(false);
  const [workingFormat, setWorkingFormat] = useState<ExportFormat | null>(null);
  const [notice, setNotice] = useState<{ text: string; selectionKey: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => () => { controller.current?.abort(); }, []));

  // ── Format picker ────────────────────────────────────────────────────────────

  function pickFormat() {
    if (disabled || working) return;
    const filters = getFilters();
    if (!filters) {
      Alert.alert('Please wait', 'Let the current search finish before exporting.');
      return;
    }

    const formats: ExportFormat[] = ['csv', 'pdf', 'xlsx'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Choose export format',
          message: 'The export will include all matching entries, not just the loaded page.',
          options: [...formats.map((f) => FORMAT_LABELS[f]), 'Cancel'],
          cancelButtonIndex: formats.length,
          destructiveButtonIndex: undefined,
        },
        (index) => {
          const fmt = formats[index];
          if (fmt) void runExport(fmt, filters);
        }
      );
    } else {
      // Android — use Alert with 3 buttons + cancel.
      Alert.alert(
        'Choose export format',
        'The export includes all matching entries, not just loaded pages. The file is not encrypted.',
        [
          { text: FORMAT_LABELS.csv,  onPress: () => void runExport('csv',  filters) },
          { text: FORMAT_LABELS.pdf,  onPress: () => void runExport('pdf',  filters) },
          { text: FORMAT_LABELS.xlsx, onPress: () => void runExport('xlsx', filters) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }

  // ── Run export ───────────────────────────────────────────────────────────────

  async function runExport(format: ExportFormat, filters: ActivityFilters) {
    const request = new AbortController();
    controller.current = request;
    const release = () => {
      if (controller.current === request) controller.current = null;
    };

    setWorking(true);
    setWorkingFormat(format);
    setNotice(null);

    try {
      if (request.signal.aborted) return;

      let rowCount = 0;
      let fileName = '';

      if (format === 'csv') {
        // Re-use the existing CSV service (already battle-tested with tests).
        const result = await exportActivityCsv(db, filters, { signal: request.signal });
        if (result.status === 'cancelled' || request.signal.aborted) return;
        rowCount = result.rowCount;
        fileName = result.fileName;
      } else {
        // PDF and Excel both need the full item list first.
        const items = await getActivityForExport(db, filters);
        if (request.signal.aborted) return;
        if (items.length === 0) {
          Alert.alert('Nothing to export', 'No entries match these filters.');
          return;
        }

        const title = `PocketLedger Export`;
        const result = format === 'pdf'
          ? await exportActivityPdf(items, title)
          : await exportActivityXlsx(items, title);

        if (result.status === 'cancelled' || request.signal.aborted) return;
        rowCount = result.rowCount;
        fileName = result.fileName;
      }

      if (mounted.current && !request.signal.aborted) {
        setNotice({
          selectionKey,
          text: `${FORMAT_LABELS[format]} prepared · ${rowCount} ${rowCount === 1 ? 'entry' : 'entries'}. Choose where to save or share in the sheet above.`,
        });
      }
    } catch (error) {
      logUnexpectedError(`Failed to export ${format.toUpperCase()}:`, error);
      if (mounted.current && !request.signal.aborted) {
        Alert.alert('Unable to export', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      release();
      if (mounted.current) {
        setWorking(false);
        setWorkingFormat(null);
      }
    }
  }

  const busyLabel = workingFormat
    ? `Preparing ${FORMAT_LABELS[workingFormat]}…`
    : 'Preparing export…';

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Export matching entries"
        accessibilityState={{ disabled: disabled || working, busy: working }}
        disabled={disabled || working}
        onPress={pickFormat}
        style={[styles.button, (disabled || working) && styles.disabled]}
      >
        <Ionicons
          name={working ? 'hourglass-outline' : 'download-outline'}
          size={19}
          color={colors.primary}
        />
        <Text style={styles.label}>
          {working ? busyLabel : 'Export'}
        </Text>
        {!working && (
          <Ionicons name="chevron-down" size={13} color={colors.primary} />
        )}
      </Pressable>

      <Text style={styles.hint}>
        Exports all matching entries, not just the current page. Exported files contain private financial data.
      </Text>

      {notice?.selectionKey === selectionKey && (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice.text}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((colors) =>
  StyleSheet.create({
    container: { gap: spacing.sm, marginTop: spacing.sm },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    label: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    notice: { color: colors.success, fontSize: 12, lineHeight: 18 },
    disabled: { opacity: 0.45 },
  })
);
