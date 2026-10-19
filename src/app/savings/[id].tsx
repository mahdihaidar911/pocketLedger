import {
    useCallback,
    useState,
} from 'react';

import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    router,
    useFocusEffect,
    useLocalSearchParams,
} from 'expo-router';

import {
    useSQLiteContext,
} from 'expo-sqlite';

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    Card,
    Screen,
} from '../../components';

import {
    archiveSavingsGoal,
    getSavingsGoalById,
} from '../../repositories/savingsGoalRepository';

import {
    getTransfersForAccount,
} from '../../repositories/transferRepository';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';

import type {
    SavingsGoalListItem,
    TransferListItem,
} from '../../types';

import {
    formatMoney,
} from '../../utils';

export default function SavingsGoalDetailsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db =
    useSQLiteContext();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [
    goal,
    setGoal,
  ] =
    useState<SavingsGoalListItem | null>(
      null
    );

  const [
    transfers,
    setTransfers,
  ] =
    useState<TransferListItem[]>(
      []
    );

  const [loading, setLoading] =
    useState(true);

  const [archiving, setArchiving] =
    useState(false);

  const loadGoal =
    useCallback(async () => {
      if (!id) {
        return;
      }

      try {
        setLoading(true);

        const result =
          await getSavingsGoalById(
            db,
            id
          );

        setGoal(result);

        if (result) {
          const history =
            await getTransfersForAccount(
              db,
              result.accountId
            );

          setTransfers(history);
        }
      } catch (error) {
        console.error(
          'Failed to load savings goal:',
          error
        );
      } finally {
        setLoading(false);
      }
    }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      loadGoal();
    }, [loadGoal])
  );

  if (loading) {
    return (
      <Screen>
        <Text style={styles.loading}>
          Loading goal...
        </Text>
      </Screen>
    );
  }

  if (!goal) {
    return (
      <Screen>
        <Card>
          <Text style={styles.notFoundTitle}>
            Goal not found
          </Text>

          <Pressable
            onPress={() =>
              router.back()
            }
          >
            <Text style={styles.backLink}>
              Go back
            </Text>
          </Pressable>
        </Card>
      </Screen>
    );
  }

  const rawProgress =
    goal.currentAmountMinor /
    goal.targetAmountMinor;

  const progress =
    Math.max(
      0,
      Math.min(rawProgress, 1)
    );

  const percentage =
    Math.round(
      rawProgress * 100
    );

  const remaining =
    Math.max(
      goal.targetAmountMinor -
        goal.currentAmountMinor,
      0
    );

  function handleArchive() {
    if (!goal) {
      return;
    }

    if (
      goal.currentAmountMinor !== 0
    ) {
      Alert.alert(
        'Money still in goal',
        'Withdraw all money from this savings goal before archiving it.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Withdraw',
            onPress: () =>
              router.push({
                pathname:
                  '/transfers/add',

                params: {
                  sourceAccountId:
                    goal.accountId,
                },
              }),
          },
        ]
      );

      return;
    }

    Alert.alert(
      'Archive savings goal?',
      `${goal.name} will be removed from your active savings goals.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          style: 'destructive',

          onPress: async () => {
            try {
              setArchiving(true);

              await archiveSavingsGoal(
                db,
                goal.id
              );

              router.replace(
                '/savings'
              );
            } catch (error) {
              console.error(
                'Failed to archive goal:',
                error
              );

              Alert.alert(
                'Unable to archive',
                error instanceof Error
                  ? error.message
                  : 'Something went wrong.'
              );

              setArchiving(false);
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
          style={styles.headerButton}
          onPress={() =>
            router.back()
          }
        >
          <Ionicons
            name="chevron-back"
            size={23}
            color={colors.text}
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          Savings Goal
        </Text>

        <Pressable
          style={styles.headerButton}
          onPress={() =>
            router.push({
              pathname:
                '/savings/edit/[id]',
              params: {
                id: goal.id,
              },
            })
          }
        >
          <Ionicons
            name="create-outline"
            size={21}
            color={colors.primary}
          />
        </Pressable>
      </View>

      <Card style={styles.heroCard}>
        <View style={styles.goalIcon}>
          <Ionicons
            name={
              (goal.icon ??
                'flag-outline') as keyof typeof Ionicons.glyphMap
            }
            size={26}
            color={colors.primary}
          />
        </View>

        <Text style={styles.goalName}>
          {goal.name}
        </Text>

        <Text style={styles.percentage}>
          {percentage}% complete
        </Text>

        <View style={styles.moneyRow}>
          <Text style={styles.savedAmount}>
            {formatMoney(
              goal.currentAmountMinor,
              goal.currency
            )}
          </Text>

          <Text style={styles.targetAmount}>
            of{' '}
            {formatMoney(
              goal.targetAmountMinor,
              goal.currency
            )}
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width:
                  `${progress * 100}%`,
              },
            ]}
          />
        </View>

        <Text style={styles.remaining}>
          {remaining === 0
            ? 'Goal reached 🎉'
            : `${formatMoney(
                remaining,
                goal.currency
              )} remaining`}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname:
                '/transfers/add',

              params: {
                destinationAccountId:
                  goal.accountId,
              },
            })
          }
        >
          <Ionicons
            name="add"
            size={19}
            color={colors.textInverse}
          />

          <Text
            style={
              styles.primaryButtonText
            }
          >
            Add Money
          </Text>
        </Pressable>

        <Pressable
          disabled={
            goal.currentAmountMinor <= 0
          }
          style={[
            styles.secondaryButton,

            goal.currentAmountMinor <= 0 &&
              styles.disabledButton,
          ]}
          onPress={() =>
            router.push({
              pathname:
                '/transfers/add',

              params: {
                sourceAccountId:
                  goal.accountId,
              },
            })
          }
        >
          <Ionicons
            name="arrow-up-outline"
            size={18}
            color={
              goal.currentAmountMinor <= 0
                ? colors.textMuted
                : colors.text
            }
          />

          <Text
            style={[
              styles.secondaryButtonText,

              goal.currentAmountMinor <= 0 &&
                styles.disabledText,
            ]}
          >
            Withdraw
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Activity
        </Text>

        <Text style={styles.sectionCount}>
          {transfers.length}
        </Text>
      </View>

      {transfers.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>
            No activity yet
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            Contributions and
            withdrawals will appear
            here.
          </Text>
        </Card>
      ) : (
        <View style={styles.history}>
          {transfers.map(
            (transfer) => {
              const contribution =
                transfer.destinationAccountId ===
                goal.accountId;

              const amountMinor =
                contribution
                  ? transfer.destinationAmountMinor
                  : transfer.sourceAmountMinor;

              const currency =
                contribution
                  ? transfer.destinationCurrency
                  : transfer.sourceCurrency;

              return (
                <Card
                  key={transfer.id}
                  style={styles.historyCard}
                >
                  <View
                    style={
                      styles.historyRow
                    }
                  >
                    <View
                      style={[
                        styles.historyIcon,

                        contribution
                          ? styles.contributionIcon
                          : styles.withdrawIcon,
                      ]}
                    >
                      <Ionicons
                        name={
                          contribution
                            ? 'arrow-down-outline'
                            : 'arrow-up-outline'
                        }
                        size={18}
                        color={
                          contribution
                            ? colors.income
                            : colors.expense
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.historyMain
                      }
                    >
                      <Text
                        style={
                          styles.historyTitle
                        }
                      >
                        {contribution
                          ? 'Contribution'
                          : 'Withdrawal'}
                      </Text>

                      <Text
                        style={
                          styles.historyMeta
                        }
                        numberOfLines={1}
                      >
                        {
                          transfer.sourceAccountName
                        }
                        {' → '}
                        {
                          transfer.destinationAccountName
                        }
                      </Text>

                      <Text
                        style={
                          styles.historyDate
                        }
                      >
                        {formatDate(
                          transfer.occurredAt
                        )}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.historyAmount,

                        contribution
                          ? styles.positiveAmount
                          : styles.negativeAmount,
                      ]}
                    >
                      {contribution
                        ? '+'
                        : '-'}
                      {formatMoney(
                        amountMinor,
                        currency
                      )}
                    </Text>
                  </View>
                </Card>
              );
            }
          )}
        </View>
      )}

      <Pressable
        disabled={archiving}
        style={styles.archiveButton}
        onPress={handleArchive}
      >
        <Ionicons
          name="archive-outline"
          size={18}
          color={colors.danger}
        />

        <Text style={styles.archiveText}>
          {archiving
            ? 'Archiving...'
            : 'Archive Goal'}
        </Text>
      </Pressable>
    </Screen>
  );
}

function formatDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(
    new Date(value)
  );
}

const useStyles =
  createThemedStyles((colors) => StyleSheet.create({
    content: {
      paddingBottom: 80,
    },

    loading: {
      color:
        colors.textSecondary,
    },

    header: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom:
        spacing.xxl,
    },

    headerButton: {
      width: 42,
      height: 42,
      borderRadius:
        radius.full,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    headerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },

    heroCard: {
      alignItems: 'center',
      padding: spacing.xxl,
      marginBottom:
        spacing.lg,
    },

    goalIcon: {
      width: 58,
      height: 58,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.primarySoft,
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom:
        spacing.lg,
    },

    goalName: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
    },

    percentage: {
      color:
        colors.textSecondary,
      fontSize: 12,
      marginTop:
        spacing.xs,
    },

    moneyRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
      marginTop:
        spacing.xxl,
    },

    savedAmount: {
      color: colors.text,
      fontSize: 30,
      fontWeight: '700',
    },

    targetAmount: {
      color:
        colors.textSecondary,
      fontSize: 13,
    },

    progressTrack: {
      width: '100%',
      height: 9,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.border,
      overflow: 'hidden',
      marginTop:
        spacing.lg,
    },

    progressFill: {
      height: '100%',
      borderRadius:
        radius.full,
      backgroundColor:
        colors.primary,
    },

    remaining: {
      color:
        colors.textSecondary,
      fontSize: 12,
      marginTop:
        spacing.md,
    },

    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom:
        spacing.xxxl,
    },

    primaryButton: {
      flex: 1,
      height: 50,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.primarySolid,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'center',
      gap: spacing.xs,
    },

    primaryButtonText: {
      color:
        colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },

    secondaryButton: {
      flex: 1,
      height: 50,
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'center',
      gap: spacing.xs,
    },

    secondaryButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },

    disabledButton: {
      opacity: 0.45,
    },

    disabledText: {
      color: colors.textMuted,
    },

    sectionHeader: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom:
        spacing.md,
    },

    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },

    sectionCount: {
      color:
        colors.textMuted,
      fontSize: 12,
    },

    history: {
      gap: spacing.sm,
    },

    historyCard: {
      padding: spacing.lg,
    },

    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    historyIcon: {
      width: 42,
      height: 42,
      borderRadius:
        radius.md,
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight:
        spacing.md,
    },

    contributionIcon: {
      backgroundColor:
        colors.successSoft,
    },

    withdrawIcon: {
      backgroundColor:
        colors.dangerSoft,
    },

    historyMain: {
      flex: 1,
    },

    historyTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },

    historyMeta: {
      color:
        colors.textMuted,
      fontSize: 10,
      marginTop:
        spacing.xs,
    },

    historyDate: {
      color:
        colors.textMuted,
      fontSize: 10,
      marginTop:
        spacing.xs,
    },

    historyAmount: {
      fontSize: 13,
      fontWeight: '700',
      marginLeft:
        spacing.sm,
    },

    positiveAmount: {
      color: colors.income,
    },

    negativeAmount: {
      color: colors.expense,
    },

    archiveButton: {
      height: 48,
      borderWidth: 1,
      borderColor:
        colors.dangerBorder,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'center',
      gap: spacing.sm,
      marginTop:
        spacing.xxxl,
    },

    archiveText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '700',
    },

    emptyTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom:
        spacing.sm,
    },

    emptyDescription: {
      color:
        colors.textSecondary,
      fontSize: 12,
    },

    notFoundTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom:
        spacing.lg,
    },

    backLink: {
      color: colors.primary,
      fontWeight: '700',
    },
  }));
