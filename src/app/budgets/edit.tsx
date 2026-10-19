import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen } from '../../components';
import { getCategories } from '../../repositories/categoryRepository';
import { deleteMonthlyBudget, getMonthlyBudgets, saveMonthlyBudget } from '../../repositories/budgetRepository';
import type { Category, CurrencyCode } from '../../types';
import type { MonthlyBudget } from '../../types/budget';
import { budgetMonthPeriod, currentBudgetMonth } from '../../utils/budgetMonths';
import { parseAmountToMinor } from '../../utils/money';
import { formatCsvAmount } from '../../utils/activityCsv';
import { logUnexpectedError, ValidationError } from '../../utils/errors';
import { createThemedStyles, useTheme, spacing } from '../../theme';

export default function EditBudgetScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ month?: string; id?: string }>();
  const month = typeof params.month === 'string' ? params.month : currentBudgetMonth();
  const id = typeof params.id === 'string' ? params.id : null;
  const [categories, setCategories] = useState<Category[]>([]);
  const [existing, setExisting] = useState<MonthlyBudget | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    (async () => {
      const period = budgetMonthPeriod(month);
      const [options, budgets] = await Promise.all([getCategories(db, 'expense'), getMonthlyBudgets(db, month)]);
      const budget = id ? budgets.find((item) => item.id === id) : null;
      if (id && !budget) throw new ValidationError('Budget not found. Go back to the budget list.');
      if (!active) return;
      setLabel(period.label); setCategories(options); setExisting(budget ?? null);
      setCategoryId(budget?.categoryId ?? ''); setCurrency(budget?.currency ?? 'USD');
      setAmount(budget ? formatCsvAmount(budget.limitMinor, budget.currency) : '');
    })().catch((cause) => {
      logUnexpectedError('Failed to load budget:', cause);
      if (active) setError(cause instanceof ValidationError ? cause.message : 'Unable to load this budget. Try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, month, id, revision]);

  async function perform(remove = false) {
    if (busy.current || loading || error) return;
    busy.current = true; setWorking(true);
    try {
      if (remove && existing) await deleteMonthlyBudget(db, existing.id, existing.updatedAt);
      else {
        const limitMinor = parseAmountToMinor(amount, currency);
        if (limitMinor === null || limitMinor <= 0) throw new ValidationError('Enter a valid amount greater than zero.');
        if (!categoryId) throw new ValidationError('Choose an expense category.');
        await saveMonthlyBudget(db, { month, categoryId, currency, limitMinor, expectedUpdatedAt: existing?.updatedAt ?? null });
      }
      if (mounted.current) router.back();
    } catch (cause) {
      logUnexpectedError('Failed to change budget:', cause);
      if (mounted.current) Alert.alert('Unable to change budget', cause instanceof ValidationError ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      busy.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  return <Screen scroll contentStyle={styles.content}>
    <Pressable accessibilityRole="button" disabled={working} onPress={() => router.back()}><Text style={styles.link}>‹ Back</Text></Pressable>
    <Text style={styles.title}>{id ? 'Edit Budget' : 'Add Budget'}</Text>
    {loading ? <Text style={styles.caption}>Loading...</Text> : error ? <>
      <Text style={styles.caption}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setRevision((value) => value + 1)}><Text style={styles.link}>Try again</Text></Pressable>
    </> : <>
      <Text style={styles.caption}>{label} only · no automatic rollover</Text>
      <Text style={styles.label}>Currency</Text>
      <View style={styles.wrap}>{(['USD', 'LBP'] as const).map((value) =>
        <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: currency === value, disabled: !!existing || working }}
          disabled={!!existing || working} style={[styles.chip, currency === value && styles.selected]}
          onPress={() => { setCurrency(value); setAmount(''); }}><Text style={currency === value ? styles.white : styles.caption}>{value}</Text></Pressable>)}</View>
      <Text style={styles.label}>Expense category</Text>
      {existing ? <Text style={styles.caption}>{existing.categoryName}{!existing.categoryActive ? ' (inactive)' : ''}</Text> :
        <View style={styles.wrap}>{categories.map((category) => <Pressable key={category.id} accessibilityRole="button"
          accessibilityState={{ selected: categoryId === category.id }} disabled={working}
          style={[styles.chip, categoryId === category.id && styles.selected]} onPress={() => setCategoryId(category.id)}>
          <Text style={categoryId === category.id ? styles.white : styles.caption}>{category.name}</Text>
        </Pressable>)}</View>}
      {!existing && !categories.length && <Text style={styles.caption}>Create or reactivate an expense category first.</Text>}
      <Text style={styles.label}>Monthly limit ({currency})</Text>
      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} placeholderTextColor={colors.textMuted} accessibilityLabel={`Monthly limit in ${currency}`} style={styles.input} value={amount} onChangeText={setAmount}
        editable={!working} keyboardType={currency === 'USD' ? 'decimal-pad' : 'number-pad'} placeholder={currency === 'USD' ? '100.00' : '1000000'} />
      <Text style={styles.caption}>This changes your target only. Your transactions and account balances stay unchanged.</Text>
      <Pressable accessibilityRole="button" disabled={working} style={[styles.button, working && styles.disabled]} onPress={() => void perform()}>
        <Text style={styles.white}>{working ? 'Working...' : 'Save Budget'}</Text></Pressable>
      {existing && <Pressable accessibilityRole="button" disabled={working} onPress={() => Alert.alert('Remove budget?',
        'Only this month’s budget limit will be removed. All transactions will remain.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void perform(true) },
        ])}><Text style={styles.danger}>Remove Budget</Text></Pressable>}
    </>}
  </Screen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 80 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  link: { color: colors.primary, fontWeight: '600', paddingVertical: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  input: { backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.lg, fontSize: 22 },
  button: { backgroundColor: colors.primarySolid, borderRadius: 14, padding: spacing.lg, alignItems: 'center' },
  white: { color: colors.textInverse, fontWeight: '600', fontSize: 15 },
  danger: { color: colors.danger, padding: spacing.lg, textAlign: 'center', fontWeight: '600' },
  disabled: { opacity: 0.5 },
}));
