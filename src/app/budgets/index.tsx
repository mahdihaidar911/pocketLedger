import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Screen } from '../../components';
import { BudgetCard } from '../../components/BudgetCard';
import { useMonthlyBudgets } from '../../hooks/useMonthlyBudgets';
import { budgetMonthPeriod, currentBudgetMonth, shiftBudgetMonth } from '../../utils/budgetMonths';
import { createThemedStyles, spacing } from '../../theme';

export default function BudgetsScreen() {
  const styles = useStyles();
  const [month, setMonth] = useState(currentBudgetMonth);
  const { items, loading, error, retry } = useMonthlyBudgets(month);
  return <Screen scroll contentStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>‹ Back</Text></Pressable>
    <Text style={styles.title}>Monthly Budgets</Text>
    <Text style={styles.caption}>Category spending limits. Each month is separate; USD and LBP are never combined.</Text>
    <View style={styles.period}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={month === '0001-01'}
        onPress={() => setMonth(shiftBudgetMonth(month, -1))}><Text style={styles.arrow}>‹</Text></Pressable>
      <Text style={styles.month}>{budgetMonthPeriod(month).label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={month === '9998-12'}
        onPress={() => setMonth(shiftBudgetMonth(month, 1))}><Text style={styles.arrow}>›</Text></Pressable>
    </View>
    {month !== currentBudgetMonth() && <Pressable accessibilityRole="button" onPress={() => setMonth(currentBudgetMonth())}>
      <Text style={styles.link}>Return to this month</Text></Pressable>}
    <Pressable accessibilityRole="button" style={styles.button}
      onPress={() => router.push({ pathname: '/budgets/edit', params: { month } })}>
      <Text style={styles.buttonText}>Add Budget</Text>
    </Pressable>
    {loading ? <Text style={styles.caption}>Loading budgets...</Text> : error ?
      <Pressable accessibilityRole="button" onPress={retry}><Text style={styles.link}>Unable to load budgets. Try again</Text></Pressable>
      : items.length ? items.map((budget) => <BudgetCard key={budget.id} budget={budget}
        onEdit={() => router.push({ pathname: '/budgets/edit', params: { month, id: budget.id } })} />)
        : <Card><Text style={styles.month}>No budgets this month</Text><Text style={styles.caption}>Add one to start. Existing expenses in this month will count automatically.</Text></Card>}
    <Text style={styles.caption}>Only recorded expenses count. Transfers, income, and unrecorded recurring items are excluded. Going over budget never blocks a transaction.</Text>
  </Screen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 80 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  link: { color: colors.primary, fontWeight: '600', paddingVertical: spacing.sm },
  period: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { color: colors.text, fontSize: 17, fontWeight: '600' },
  arrow: { color: colors.primary, fontSize: 32, paddingHorizontal: 16, paddingVertical: 4 },
  button: { backgroundColor: colors.primarySolid, borderRadius: 14, padding: spacing.lg, alignItems: 'center' },
  buttonText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
}));
