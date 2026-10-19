import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useMonthlyBudgets } from '../hooks/useMonthlyBudgets';
import { currentBudgetMonth } from '../utils/budgetMonths';
import { BudgetCard } from './BudgetCard';
import { Card } from './Card';
import { createThemedStyles, spacing } from '../theme';

export function HomeBudgets() {
  const styles = useStyles();
  const [month, setMonth] = useState(currentBudgetMonth);
  useFocusEffect(useCallback(() => { setMonth(currentBudgetMonth()); }, []));
  const { items, loading, error, retry } = useMonthlyBudgets(month);
  const top = [...items].sort((a, b) => b.spentMinor / b.limitMinor - a.spentMinor / a.limitMinor).slice(0, 3);
  return <View style={styles.section}>
    <View style={styles.row}>
      <Text style={styles.title}>Monthly Budgets</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/budgets')} hitSlop={8}>
        <Text style={styles.link}>View all</Text>
      </Pressable>
    </View>
    {loading ? <Text style={styles.caption}>Loading budgets...</Text> : error ?
      <Pressable accessibilityRole="button" onPress={retry}><Text style={styles.link}>Unable to load budgets. Try again</Text></Pressable>
      : top.length ? top.map((budget) => <BudgetCard key={budget.id} budget={budget} />) :
        <Card><Text style={styles.caption}>No budgets for this month. Set category limits to track your spending.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/budgets')}><Text style={styles.link}>Set a budget</Text></Pressable>
        </Card>}
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  section: { gap: spacing.md, marginBottom: spacing.xxl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  caption: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  link: { color: colors.primary, fontWeight: '600', minHeight: 44, paddingVertical: spacing.md },
}));
