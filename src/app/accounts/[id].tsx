import { Ionicons } from '@expo/vector-icons';
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Card, Screen } from '../../components';
import { getAccountById } from '../../repositories';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import type { Account } from '../../types';
import { formatMoney } from '../../utils';

export default function AccountDetailsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db = useSQLiteContext();

  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const [account, setAccount] =
    useState<Account | null>(null);

  const [loading, setLoading] =
    useState(true);

  const loadAccount = useCallback(async () => {
    if (!id) {
      return;
    }

    try {
      setLoading(true);

      const result = await getAccountById(
        db,
        id
      );

      setAccount(result);
    } catch (error) {
      console.error(
        'Failed to load account:',
        error
      );
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount])
  );

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      </Screen>
    );
  }

  if (!account) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.text}
            />
          </Pressable>

          <Text style={styles.headerTitle}>
            Account
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <Card>
          <Text style={styles.notFoundTitle}>
            Account not found
          </Text>

          <Text style={styles.secondaryText}>
            This account may no longer exist.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      contentStyle={styles.content}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.text}
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          Account
        </Text>

        <Pressable
  style={styles.editButton}
  onPress={() =>
    router.push({
      pathname: '/accounts/edit/[id]',
      params: {
        id: account.id,
      },
    })
  }
>
          <Text style={styles.editText}>
            Edit
          </Text>
        </Pressable>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.accountName}>
          {account.name}
        </Text>

        <Text style={styles.balanceLabel}>
          Current Balance
        </Text>

        <Text style={styles.balance}>
          {formatMoney(
            account.balanceMinor,
            account.currency
          )}
        </Text>

        <Text style={styles.currency}>
          {account.currency}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Account Information
      </Text>

      <Card style={styles.infoCard}>
        <InfoRow
          label="Account type"
          value={
            account.type
              .charAt(0)
              .toUpperCase() +
            account.type.slice(1)
          }
        />

        <View style={styles.divider} />

        <InfoRow
          label="Currency"
          value={account.currency}
        />

        <View style={styles.divider} />

        <InfoRow
          label="Status"
          value={
            account.isActive
              ? 'Active'
              : 'Inactive'
          }
        />

        <View style={styles.divider} />

        <InfoRow
          label="Low balance alert"
          value={
            account.lowBalanceThresholdMinor ===
            null
              ? 'Not set'
              : formatMoney(
                  account.lowBalanceThresholdMinor,
                  account.currency
                )
          }
        />
      </Card>

      <Text style={styles.sectionTitle}>
        Activity
      </Text>

      <Card>
        <Text style={styles.emptyTitle}>
          No transactions yet
        </Text>

        <Text style={styles.secondaryText}>
          Expenses, income and transfers using
          this account will appear here.
        </Text>
      </Card>
    </Screen>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: {
    paddingBottom: 60,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  headerSpacer: {
    width: 42,
  },

  editButton: {
    minWidth: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },

  editText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  balanceCard: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    marginBottom: spacing.xxxl,
  },

  accountName: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.xxl,
  },

  balanceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm,
  },

  balance: {
    color: colors.textInverse,
    fontSize: 36,
    fontWeight: '700',
  },

  currency: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },

  infoCard: {
    marginBottom: spacing.xxxl,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 42,
  },

  infoLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },

  secondaryText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },

  notFoundTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
}));
