import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Screen } from '../../../components';
import { getAccounts } from '../../../repositories/accountRepository';
import { getCategories } from '../../../repositories/categoryRepository';
import {
  getRecurringPaymentById,
  updateRecurringPayment,
} from '../../../repositories/recurringPaymentRepository';
import { createThemedStyles, useTheme, radius, spacing } from '../../../theme';
import { syncRecurringReminders } from '../../../services';
import type {
  Account,
  Category,
  RecurringFrequency,
  TransactionType,
} from '../../../types';
import { parseAmountToMinor } from '../../../utils';

const frequencies: RecurringFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

export default function EditRecurringPaymentScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const [item, accountResult] = await Promise.all([
        getRecurringPaymentById(db, id),
        getAccounts(db),
      ]);

      if (!item) {
        Alert.alert('Not found', 'This recurring payment no longer exists.');
        router.back();
        return;
      }

      setAccounts(accountResult);
      setType(item.type);
      setName(item.name);
      setAccountId(item.accountId);
      setCategoryId(item.categoryId);
      setAmount(
        item.currency === 'USD'
          ? (item.amountMinor / 100).toFixed(2)
          : String(item.amountMinor)
      );
      setFrequency(item.frequency);
      setNextDueDate(item.nextDueDate);
      setMerchant(item.merchant ?? '');
      setNote(item.note ?? '');
    } catch (error) {
      console.error('Failed to load recurring payment for editing:', error);
      Alert.alert('Unable to load', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useFocusEffect(useCallback(() => void load(), [load]));

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const result = await getCategories(db, type);
        if (!cancelled) {
          setCategories(result);
          setCategoryId((current) =>
            result.some((category) => category.id === current)
              ? current
              : result[0]?.id ?? null
          );
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [db, type]);

  const selectedAccount =
    accounts.find((account) => account.id === accountId) ?? null;

  async function handleSave() {
    if (!id || !selectedAccount) {
      Alert.alert('Account required', 'Choose an active account.');
      return;
    }

    const amountMinor = parseAmountToMinor(amount, selectedAccount.currency);

    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this recurring payment.');
      return;
    }

    if (amountMinor === null || amountMinor <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }

    try {
      setSaving(true);
      await updateRecurringPayment(db, id, {
        name,
        type,
        accountId: selectedAccount.id,
        categoryId,
        amountMinor,
        frequency,
        nextDueDate,
        merchant,
        note,
      });
      await syncRecurringReminders(db);
      router.back();
    } catch (error) {
      console.error('Failed to update recurring payment:', error);
      Alert.alert(
        'Unable to save',
        error instanceof Error ? error.message : 'Something went wrong.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Screen><Text style={styles.loading}>Loading...</Text></Screen>;
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Edit Recurring</Text>
        <Pressable disabled={saving} onPress={handleSave}>
          <Text style={styles.save}>{saving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Type</Text>
      <View style={styles.row}>
        {(['expense', 'income'] as TransactionType[]).map((value) => (
          <Choice
            key={value}
            label={value === 'expense' ? 'Expense' : 'Income'}
            selected={type === value}
            onPress={() => setType(value)}
          />
        ))}
      </View>

      <Field label="Name" value={name} onChangeText={setName} />

      <Text style={styles.label}>Account</Text>
      <View style={styles.wrap}>
        {accounts.map((account) => (
          <Choice
            key={account.id}
            label={`${account.name} · ${account.currency}`}
            selected={accountId === account.id}
            onPress={() => {
              setAccountId(account.id);
              setAmount('');
            }}
          />
        ))}
      </View>

      <Field
        label={`Amount${selectedAccount ? ` (${selectedAccount.currency})` : ''}`}
        value={amount}
        onChangeText={setAmount}
        keyboardType={selectedAccount?.currency === 'USD' ? 'decimal-pad' : 'number-pad'}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.wrap}>
        {categories.map((category) => (
          <Choice
            key={category.id}
            label={category.name}
            selected={categoryId === category.id}
            onPress={() => setCategoryId(category.id)}
          />
        ))}
      </View>

      <Text style={styles.label}>Frequency</Text>
      <View style={styles.wrap}>
        {frequencies.map((value) => (
          <Choice
            key={value}
            label={value.charAt(0).toUpperCase() + value.slice(1)}
            selected={frequency === value}
            onPress={() => setFrequency(value)}
          />
        ))}
      </View>

      <Field
        label="Next due date"
        value={nextDueDate}
        onChangeText={setNextDueDate}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label={type === 'expense' ? 'Merchant' : 'Source'}
        value={merchant}
        onChangeText={setMerchant}
        placeholder="Optional"
      />
      <Field
        label="Note"
        value={note}
        onChangeText={setNote}
        placeholder="Optional note"
        multiline
      />

      <Pressable
        style={[styles.primaryButton, saving && styles.disabled]}
        disabled={saving}
        onPress={handleSave}
      >
        <Text style={styles.primaryButtonText}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Text>
      </Pressable>
    </Screen>
  );
}

function Choice({ label, selected, onPress }: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const { label, multiline, ...inputProps } = props;
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        {...inputProps}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.multiline]}
      />
    </>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingBottom: 60 },
  loading: { color: colors.textSecondary },
  header: {
    flexWrap: 'wrap', gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cancel: {
    minHeight: 44, paddingVertical: spacing.md, color: colors.textSecondary, fontSize: 15 },
  save: {
    minHeight: 44, paddingVertical: spacing.md, color: colors.primary, fontSize: 15, fontWeight: '700' },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  choice: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  choiceText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: colors.textInverse },
  input: {
    paddingVertical: spacing.md,
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    marginBottom: spacing.xxl,
  },
  multiline: { minHeight: 100, paddingTop: spacing.lg, textAlignVertical: 'top' },
  primaryButton: {
    paddingVertical: spacing.md,
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primarySolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  disabled: { opacity: 0.55 },
}));
