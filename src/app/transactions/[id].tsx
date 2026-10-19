import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Screen } from '../../components';
import { deleteTransaction, getTransactionById } from '../../repositories';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import type { TransactionListItem } from '../../types';
import { formatMoney } from '../../utils';
import { logUnexpectedError } from '../../utils/errors';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/transactions');
}

export default function TransactionDetailsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [item, setItem] = useState<TransactionListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [working, setWorking] = useState(false);
  const deleteLocked = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    async function load() {
      try {
        const result = id ? await getTransactionById(db, id) : null;
        if (active) setItem(result);
      } catch (error) {
        logUnexpectedError('Failed to load transaction:', error);
        if (active) { setItem(null); setFailed(true); }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [db, id, retry]));

  function confirmDelete() {
    if (!item || deleteLocked.current) return;
    const snapshot = item;
    deleteLocked.current = true;
    const release = () => { deleteLocked.current = false; };
    Alert.alert(
      'Delete transaction?',
      `${formatMoney(snapshot.amountMinor, snapshot.currency)} will be ${snapshot.type === 'expense' ? 'returned to' : 'removed from'} ${snapshot.accountName}. This cannot be undone. Recurring schedules will not change.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: release },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setWorking(true);
            try {
              await deleteTransaction(db, snapshot.id, snapshot.updatedAt);
              goBack();
            } catch (error) {
              logUnexpectedError('Failed to delete transaction:', error);
              Alert.alert('Unable to delete', error instanceof Error ? error.message : 'Please try again.');
              setRetry((value) => value + 1);
            } finally {
              release();
              setWorking(false);
            }
          },
        },
      ],
      { cancelable: true, onDismiss: release }
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" disabled={working} onPress={goBack} hitSlop={8}>
          <Text style={styles.action}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Transaction</Text>
        <Pressable accessibilityRole="button" disabled={working || loading || !item}
          onPress={() => item && router.push({ pathname: '/transactions/edit/[id]', params: { id: item.id } })}>
          <Text style={[styles.action, (working || loading || !item) && styles.disabled]}>Edit</Text>
        </Pressable>
      </View>

      {loading || !item ? (
        <Card>
          <Text style={styles.body}>{loading ? 'Loading transaction...' : failed ? 'Unable to load transaction.' : 'Transaction not found. It may have been deleted.'}</Text>
          {!loading && failed && (
            <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
              <Text style={styles.action}>Try Again</Text>
            </Pressable>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.label}>{item.type === 'expense' ? 'Expense' : 'Income'}</Text>
            <Text style={[styles.amount, { color: item.type === 'expense' ? colors.expense : colors.income }]}>
              {item.type === 'expense' ? '−' : '+'}{formatMoney(item.amountMinor, item.currency)}
            </Text>
            <Detail label="Account" value={item.accountName} />
            <Detail label="Category" value={item.categoryName ?? 'Uncategorized'} />
            <Detail label="Date" value={new Date(item.occurredAt).toLocaleString()} />
            <Detail label="Merchant / source" value={item.merchant || 'Not provided'} />
            <Detail label="Note" value={item.note || 'No note'} />
          </Card>
          <Text style={styles.hint}>
            Editing or deleting this entry also corrects its account balance and reports.
            If it came from a recurring payment, its schedule and next due date stay unchanged.
          </Text>
          <Pressable accessibilityRole="button" disabled={working} onPress={confirmDelete}
            style={[styles.deleteButton, working && styles.disabled]}>
            <Text style={styles.deleteText}>{working ? 'Deleting...' : 'Delete Transaction'}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.body}>{value}</Text></View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingBottom: 48, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  action: { color: colors.primary, fontSize: 16, fontWeight: '700', paddingVertical: spacing.sm },
  amount: { fontSize: 32, fontWeight: '800', marginTop: spacing.sm, marginBottom: spacing.md },
  detail: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.md, gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: 13 },
  body: { color: colors.text, fontSize: 16 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  deleteButton: { borderWidth: 1, borderColor: colors.expense, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center' },
  deleteText: { color: colors.expense, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.45 },
}));
