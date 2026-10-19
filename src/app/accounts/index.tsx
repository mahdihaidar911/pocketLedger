import { Ionicons } from '@expo/vector-icons';
import {
    router,
    useFocusEffect,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Card, Screen } from '../../components';
import {
    getAllAccounts,
    setAccountActive,
} from '../../repositories';
import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';
import type { Account } from '../../types';
import { formatMoney } from '../../utils';

export default function AccountsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db = useSQLiteContext();

  const [accounts, setAccounts] =
    useState<Account[]>([]);

  const [loading, setLoading] =
    useState(true);

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);

      const result =
        await getAllAccounts(db);

      setAccounts(result);
    } catch (error) {
      console.error(
        'Failed to load accounts:',
        error
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [loadAccounts])
  );

  const activeAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.isActive
      ),
    [accounts]
  );

  const inactiveAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => !account.isActive
      ),
    [accounts]
  );

  function handleReactivate(
    account: Account
  ) {
    Alert.alert(
      'Reactivate account?',
      `${account.name} will return to your active accounts.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reactivate',
          onPress: async () => {
            try {
              await setAccountActive(
                db,
                account.id,
                true
              );

              await loadAccounts();
            } catch (error) {
              console.error(
                'Failed to reactivate account:',
                error
              );

              Alert.alert(
                'Unable to reactivate',
                'Something went wrong.'
              );
            }
          },
        },
      ]
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
          Accounts
        </Text>

        <Pressable
          style={styles.addButton}
          onPress={() =>
            router.push('/accounts/add')
          }
        >
          <Ionicons
            name="add"
            size={26}
            color={colors.primary}
          />
        </Pressable>
      </View>

      <Text style={styles.description}>
        Manage the wallets and accounts you use
        to track your money.
      </Text>

      <Text style={styles.sectionTitle}>
        Active Accounts
      </Text>

      {loading ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.secondaryText}>
            Loading accounts...
          </Text>
        </Card>
      ) : activeAccounts.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No active accounts
          </Text>

          <Text style={styles.secondaryText}>
            Add or reactivate an account to
            continue tracking your money.
          </Text>
        </Card>
      ) : (
        <View style={styles.accountList}>
          {activeAccounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() =>
                router.push({
                  pathname: '/accounts/[id]',
                  params: {
                    id: account.id,
                  },
                })
              }
            >
              <Card style={styles.accountCard}>
                <View style={styles.accountRow}>
                  <View style={styles.leftSection}>
                    <View
                      style={styles.iconContainer}
                    >
                      <Ionicons
                        name={getAccountIcon(
                          account.type
                        )}
                        size={20}
                        color={colors.primary}
                      />
                    </View>

                    <View>
                      <Text
                        style={styles.accountName}
                      >
                        {account.name}
                      </Text>

                      <Text
                        style={styles.accountMeta}
                      >
                        {formatAccountType(
                          account.type
                        )}{' '}
                        • {account.currency}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rightSection}>
                    <Text
                      style={styles.balance}
                    >
                      {formatMoney(
                        account.balanceMinor,
                        account.currency
                      )}
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={colors.textMuted}
                    />
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {inactiveAccounts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            Inactive Accounts
          </Text>

          <View style={styles.accountList}>
            {inactiveAccounts.map(
              (account) => (
                <Card
                  key={account.id}
                  style={styles.inactiveCard}
                >
                  <View style={styles.accountRow}>
                    <View>
                      <Text
                        style={
                          styles.inactiveName
                        }
                      >
                        {account.name}
                      </Text>

                      <Text
                        style={
                          styles.accountMeta
                        }
                      >
                        {formatAccountType(
                          account.type
                        )}{' '}
                        • {account.currency}
                      </Text>

                      <Text
                        style={
                          styles.inactiveBalance
                        }
                      >
                        {formatMoney(
                          account.balanceMinor,
                          account.currency
                        )}
                      </Text>
                    </View>

                    <Pressable
                      style={
                        styles.reactivateButton
                      }
                      onPress={() =>
                        handleReactivate(
                          account
                        )
                      }
                    >
                      <Text
                        style={
                          styles.reactivateText
                        }
                      >
                        Reactivate
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              )
            )}
          </View>
        </>
      )}

      <Pressable
        style={styles.largeAddButton}
        onPress={() =>
          router.push('/accounts/add')
        }
      >
        <Ionicons
          name="add-circle-outline"
          size={21}
          color={colors.textInverse}
        />

        <Text style={styles.largeAddText}>
          Add Account
        </Text>
      </Pressable>
    </Screen>
  );
}

function formatAccountType(
  type: Account['type']
) {
  return (
    type.charAt(0).toUpperCase() +
    type.slice(1)
  );
}

function getAccountIcon(
  type: Account['type']
): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'cash':
      return 'cash-outline';

    case 'whish':
      return 'phone-portrait-outline';

    case 'bank':
      return 'business-outline';

    case 'savings':
      return 'wallet-outline';

    default:
      return 'card-outline';
  }
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: {
    paddingBottom: 60,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.xxxl,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },

  accountList: {
    gap: spacing.sm,
    marginBottom: spacing.xxxl,
  },

  accountCard: {
    padding: spacing.lg,
  },

  inactiveCard: {
    padding: spacing.lg,
    opacity: 0.75,
  },

  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  accountName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  inactiveName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  accountMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  inactiveBalance: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  balance: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  reactivateButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },

  reactivateText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },

  emptyCard: {
    marginBottom: spacing.xxxl,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  secondaryText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  largeAddButton: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySolid,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  largeAddText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse,
  },
}));
