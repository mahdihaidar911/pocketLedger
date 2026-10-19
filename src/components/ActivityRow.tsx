import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Ionicons,
} from '@expo/vector-icons';

import {
  Card,
} from './Card';

import {
  TransactionRow,
} from './TransactionRow';
import { usePhoneLayout } from '../hooks/usePhoneLayout';

import {
  createThemedStyles, useTheme,
  radius,
  spacing,
} from '../theme';

import type {
  ActivityListItem,
} from '../types';

import {
  formatMoney,
} from '../utils';

export function ActivityRow({
  activity,
}: {
  activity: ActivityListItem;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { compact } = usePhoneLayout();
  if (
    activity.kind ===
    'transaction'
  ) {
    return (
      <TransactionRow
        transaction={
          activity.data
        }
      />
    );
  }

  const transfer =
    activity.data;
  const stackAmount = compact || Math.max(
    formatMoney(transfer.sourceAmountMinor, transfer.sourceCurrency).length,
    formatMoney(transfer.destinationAmountMinor, transfer.destinationCurrency).length
  ) > 16;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View
          style={
            styles.iconContainer
          }
        >
          <Ionicons
            name="swap-horizontal"
            size={21}
            color={colors.transfer}
          />
        </View>

        <View style={styles.main}>
          <Text
            style={styles.title}
            numberOfLines={compact ? undefined : 1}
          >
            {transfer.sourceAccountName}
            {' → '}
            {transfer.destinationAccountName}
          </Text>

          <Text style={styles.meta}>
            Transfer
          </Text>

          <Text style={styles.date}>
            {formatActivityDate(
              transfer.occurredAt
            )}
          </Text>
        </View>

        <View style={[styles.transferAmountSection, stackAmount && styles.stackedAmount]}>
  <Text style={styles.amount}>
    {formatMoney(
      transfer.sourceAmountMinor,
      transfer.sourceCurrency
    )}
  </Text>

  {transfer.sourceCurrency !==
    transfer.destinationCurrency && (
    <Text
      style={
        styles.convertedAmount
      }
    >
      →{' '}
      {formatMoney(
        transfer.destinationAmountMinor,
        transfer.destinationCurrency
      )}
    </Text>
  )}
</View>
      </View>
    </Card>
  );
}

function formatActivityDate(
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
    backgroundColor: colors.primarySoft,
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
    color: colors.transfer,
    fontSize: 14,
    fontWeight: '700',
  },
  transferAmountSection: {
  flexShrink: 1,
  maxWidth: '55%',
  alignItems: 'flex-end',
  marginLeft: spacing.sm,
},

stackedAmount: { width: '100%', maxWidth: '100%', alignItems: 'flex-start', marginLeft: 0, marginTop: spacing.md },

convertedAmount: {
  color: colors.textMuted,
  fontSize: 10,
  marginTop: spacing.xs,
},
}));
