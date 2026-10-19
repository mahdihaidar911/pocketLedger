import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import type { MonthlyBudget } from '../types/budget';
import { createThemedStyles, useTheme, spacing } from '../theme';
import { formatMoney } from '../utils/money';

export function BudgetCard({ budget, onEdit }: { budget: MonthlyBudget; onEdit?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const progress = Math.min(100, Math.round(budget.spentMinor / budget.limitMinor * 100));
  const over = budget.remainingMinor < 0;
  const color = budget.remainingMinor <= 0 ? colors.danger : progress >= 80 ? colors.warning : colors.primary;
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.title}>{budget.categoryName} · {budget.currency}</Text>
        {onEdit && <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${budget.categoryName} ${budget.currency} budget`}
          onPress={onEdit} hitSlop={10}><Text style={styles.action}>Edit</Text></Pressable>}
      </View>
      {!budget.categoryActive && <Text style={styles.caption}>Inactive category · history retained</Text>}
      <Text style={styles.caption}>{formatMoney(budget.spentMinor, budget.currency)} spent of {formatMoney(budget.limitMinor, budget.currency)}</Text>
      <View style={styles.track} accessible accessibilityRole="progressbar"
        accessibilityLabel={`${budget.categoryName} budget used`} accessibilityValue={{ min: 0, max: 100, now: progress }}>
        <View style={[styles.fill, { width: `${progress}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.remaining, { color }]}>
        {over ? `${formatMoney(-budget.remainingMinor, budget.currency)} over budget`
          : budget.remainingMinor === 0 ? 'Budget reached'
          : `${formatMoney(budget.remainingMinor, budget.currency)} remaining`}
      </Text>
    </Card>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  action: { color: colors.primary, fontWeight: '600', minHeight: 44, paddingVertical: spacing.md },
  caption: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 20 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, marginVertical: spacing.md, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  remaining: { fontSize: 13, fontWeight: '600' },
}));
