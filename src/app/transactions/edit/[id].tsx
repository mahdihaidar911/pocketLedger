import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Screen } from '../../../components';
import { getAllAccounts, getAllCategories, getTransactionById, updateTransaction } from '../../../repositories';
import { checkAndFireLowBalanceAlert } from '../../../services/notificationService';
import { createThemedStyles, useTheme, radius, spacing } from '../../../theme';
import type { Account, Category, TransactionListItem, TransactionType } from '../../../types';
import { formatMoney, parseAmountToMinor } from '../../../utils';
import { logUnexpectedError } from '../../../utils/errors';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/transactions');
}

export default function EditTransactionScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [data, setData] = useState<{ item: TransactionListItem; accounts: Account[]; categories: Category[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(null);
    async function load() {
      try {
        const item = id ? await getTransactionById(db, id) : null;
        if (!item) return;
        const [accounts, expenses, income] = await Promise.all([
          getAllAccounts(db), getAllCategories(db, 'expense'), getAllCategories(db, 'income'),
        ]);
        if (active) setData({ item, accounts, categories: [...expenses, ...income] });
      } catch (error) {
        logUnexpectedError('Failed to load transaction for editing:', error);
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [db, id, retry]);

  if (loading || !data) {
    return (
      <Screen>
        <Pressable accessibilityRole="button" onPress={goBack}><Text style={styles.action}>Back</Text></Pressable>
        <Card>
          <Text style={styles.label}>{loading ? 'Loading transaction...' : failed ? 'Unable to load transaction.' : 'Transaction not found. It may have been deleted.'}</Text>
          {!loading && failed && <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={styles.action}>Try Again</Text></Pressable>}
        </Card>
      </Screen>
    );
  }
  return <EditForm key={`${data.item.id}:${data.item.updatedAt}`} {...data} />;
}

function EditForm({ item, accounts, categories }: {
  item: TransactionListItem; accounts: Account[]; categories: Category[];
}) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();
  const [type, setType] = useState<TransactionType>(item.type);
  const [accountId, setAccountId] = useState(item.accountId);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [amount, setAmount] = useState(item.currency === 'USD'
    ? `${Math.floor(item.amountMinor / 100)}.${String(item.amountMinor % 100).padStart(2, '0')}`
    : String(item.amountMinor));
  const [merchant, setMerchant] = useState(item.merchant ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [saving, setSaving] = useState(false);
  const saveLocked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const eligibleAccounts = accounts.filter((account) =>
    account.currency === item.currency && (account.isActive || account.id === item.accountId));
  const eligibleCategories = categories.filter((category) => category.kind === type &&
    (category.isActive || (category.id === item.categoryId && type === item.type)));

  async function save() {
    if (saveLocked.current) return;
    const amountMinor = parseAmountToMinor(amount, item.currency);
    if (amountMinor === null || amountMinor <= 0) {
      Alert.alert('Invalid amount', item.currency === 'USD'
        ? 'Enter an amount greater than zero with up to two decimal places.'
        : 'Enter a whole LBP amount greater than zero.');
      return;
    }
    saveLocked.current = true;
    setSaving(true);
    try {
      await updateTransaction(db, item.id, {
        expectedUpdatedAt: item.updatedAt, type, accountId, categoryId,
        amountMinor, merchant, note,
      });
      // Fire low-balance alert if the account dropped below threshold (fire-and-forget).
      checkAndFireLowBalanceAlert(db, accountId).catch(() => undefined);
      if (mounted.current) goBack();
    } catch (error) {
      logUnexpectedError('Failed to edit transaction:', error);
      if (mounted.current) Alert.alert('Unable to save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      saveLocked.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <Stack.Screen options={{ gestureEnabled: !saving }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={goBack}><Text style={styles.action}>Cancel</Text></Pressable>
        <Text style={styles.title}>Edit Transaction</Text>
      </View>

      <View style={styles.choices}>
        {(['expense', 'income'] as const).map((value) => (
          <Choice key={value} label={value === 'expense' ? 'Expense' : 'Income'} selected={type === value} disabled={saving}
            onPress={() => { if (value !== type) { setType(value); setCategoryId(null); } }} />
        ))}
      </View>

      <Card>
        <Text style={styles.label}>Amount ({item.currency})</Text>
        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} placeholderTextColor={colors.textMuted} accessibilityLabel={`Amount in ${item.currency}`} style={styles.amount} value={amount}
          onChangeText={setAmount} editable={!saving} keyboardType={item.currency === 'USD' ? 'decimal-pad' : 'number-pad'} />
        <Text style={styles.hint}>Currency stays {item.currency}; no conversion is performed.</Text>
      </Card>

      <Text style={styles.label}>Account</Text>
      <View style={styles.choices}>
        {eligibleAccounts.map((account) => (
          <Choice key={account.id} selected={accountId === account.id} disabled={saving}
            label={`${account.name}${account.isActive ? '' : ' (inactive)'} · ${formatMoney(account.balanceMinor, account.currency)}`}
            onPress={() => setAccountId(account.id)} />
        ))}
      </View>
      <Text style={styles.hint}>Moving this entry restores its old account and applies the corrected amount to the selected account. The balances above are before saving.</Text>

      <Text style={styles.label}>Category</Text>
      <View style={styles.choices}>
        <Choice label="Uncategorized" selected={categoryId === null} disabled={saving} onPress={() => setCategoryId(null)} />
        {eligibleCategories.map((category) => (
          <Choice key={category.id} label={`${category.name}${category.isActive ? '' : ' (inactive)'}`}
            selected={categoryId === category.id} disabled={saving} onPress={() => setCategoryId(category.id)} />
        ))}
      </View>

      <Text style={styles.label}>Merchant / source (optional)</Text>
      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} placeholderTextColor={colors.textMuted} accessibilityLabel="Merchant or source" style={styles.input} value={merchant} onChangeText={setMerchant} editable={!saving} />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} placeholderTextColor={colors.textMuted} accessibilityLabel="Note" style={[styles.input, styles.note]} value={note} onChangeText={setNote} editable={!saving} multiline />

      <Card>
        <Text style={styles.label}>Original date</Text>
        <Text style={styles.hint}>{new Date(item.occurredAt).toLocaleString()}</Text>
        <Text style={styles.hint}>The date, recorded exchange rate, and any recurring schedule stay unchanged.</Text>
      </Card>
      <Pressable accessibilityRole="button" disabled={saving} onPress={save} style={[styles.saveButton, saving && styles.disabled]}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
      </Pressable>
    </Screen>
  );
}

function Choice({ label, selected, disabled, onPress }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={[styles.choice, selected && styles.selectedChoice, disabled && styles.disabled]}>
      <Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: 120 },
  header: {
    flexWrap: 'wrap', gap: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  action: { color: colors.primary, fontSize: 16, fontWeight: '700', paddingVertical: spacing.lg },
  label: { color: colors.text, fontSize: 15, fontWeight: '700' },
  amount: { color: colors.text, fontSize: 32, fontWeight: '700', paddingVertical: spacing.md },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: spacing.xs },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, maxWidth: '100%' },
  selectedChoice: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectedText: { color: colors.textInverse },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, fontSize: 16, color: colors.text },
  note: { minHeight: 100, textAlignVertical: 'top' },
  saveButton: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primarySolid, alignItems: 'center', marginTop: spacing.md },
  saveText: {
    minHeight: 44, paddingVertical: spacing.md, color: colors.textInverse, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
}));
