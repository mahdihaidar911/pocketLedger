import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { router } from 'expo-router';
import { usePhoneLayout } from '../hooks/usePhoneLayout';

import {
    Ionicons,
} from '@expo/vector-icons';

import { Card } from './Card';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../theme';

import type {
    TransactionListItem,
} from '../types';

import {
    formatMoney,
} from '../utils';

type TransactionRowProps = {
  transaction: TransactionListItem;
};

export function TransactionRow({
  transaction,
}: TransactionRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { compact } = usePhoneLayout();
  const formattedAmount = formatMoney(transaction.amountMinor, transaction.currency);
  const stackAmount = compact || formattedAmount.length > 16;
  const isExpense =
    transaction.type === 'expense';

  const iconName =
    (transaction.categoryIcon ??
      (isExpense
        ? 'receipt-outline'
        : 'cash-outline')) as keyof typeof Ionicons.glyphMap;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${isExpense ? 'expense' : 'income'}: ${transaction.merchant || transaction.categoryName || 'Uncategorized'}, ${formatMoney(transaction.amountMinor, transaction.currency)}, ${transaction.accountName}`}
      onPress={() => router.push({
        pathname: '/transactions/[id]',
        params: { id: transaction.id },
      })}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={iconName}
            size={21}
            color={
              isExpense
                ? colors.expense
                : colors.income
            }
          />
        </View>

        <View style={styles.main}>
          <Text
            style={styles.title}
            numberOfLines={compact ? undefined : 1}
          >
            {transaction.merchant ||
              transaction.categoryName ||
              (isExpense
                ? 'Expense'
                : 'Income')}
          </Text>

          <Text
            style={styles.meta}
            numberOfLines={compact ? undefined : 1}
          >
            {transaction.categoryName ??
              'Uncategorized'}
            {' • '}
            {transaction.accountName}
          </Text>

          <Text style={styles.date}>
            {formatTransactionDate(
              transaction.occurredAt
            )}
          </Text>
        </View>

        <Text
          style={[
            styles.amount,
            stackAmount && styles.stackedAmount,
            isExpense
              ? styles.expenseAmount
              : styles.incomeAmount,
          ]}
        >
          {isExpense ? '-' : '+'}
          {formattedAmount}
        </Text>
      </View>
    </Card>
    </Pressable>
  );
}

function formatTransactionDate(
  value: string
) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(date);
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: {
    padding: spacing.lg,
  },

  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  main: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  meta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
  },

  date: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: spacing.xs,
  },

  amount: {
    flexShrink: 1,
    maxWidth: '55%',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },

  expenseAmount: {
    color: colors.expense,
  },

  stackedAmount: { width: '100%', maxWidth: '100%', marginLeft: 0, marginTop: spacing.md },

  incomeAmount: {
    color: colors.income,
  },
}));
