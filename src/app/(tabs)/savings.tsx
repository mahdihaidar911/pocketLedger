import {
  useCallback,
  useState,
} from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  router,
  useFocusEffect,
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
  getSavingsGoals,
} from '../../repositories/savingsGoalRepository';

import {
  createThemedStyles, useTheme,
  radius,
  spacing,
} from '../../theme';

import type {
  SavingsGoalListItem,
} from '../../types';

import {
  formatMoney,
} from '../../utils';

export default function SavingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db =
    useSQLiteContext();

  const [
    goals,
    setGoals,
  ] =
    useState<
      SavingsGoalListItem[]
    >([]);

  const [loading, setLoading] =
    useState(true);

  const loadGoals =
    useCallback(async () => {
      try {
        setLoading(true);

        const result =
          await getSavingsGoals(
            db
          );

        setGoals(result);
      } catch (error) {
        console.error(
          'Failed to load savings goals:',
          error
        );
      } finally {
        setLoading(false);
      }
    }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  return (
    <Screen bottomInset={false}
      scroll
      contentStyle={
        styles.content
      }
    >
      <View
        style={styles.header}
      >
        <View>
          <Text
            style={
              styles.subtitle
            }
          >
            Build toward what matters
          </Text>

          <Text
            style={styles.title}
          >
            Savings
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() =>
            router.push(
              '/savings/add'
            )
          }
        >
          <Ionicons
            name="add"
            size={24}
            color={
              colors.textInverse
            }
          />
        </Pressable>
      </View>

      {loading ? (
        <Card>
          <Text
            style={
              styles.emptyDescription
            }
          >
            Loading goals...
          </Text>
        </Card>
      ) : goals.length === 0 ? (
        <Card
          style={styles.emptyCard}
        >
          <View
            style={
              styles.emptyIcon
            }
          >
            <Ionicons
              name="flag-outline"
              size={28}
              color={colors.primary}
            />
          </View>

          <Text
            style={
              styles.emptyTitle
            }
          >
            Start your first goal
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            Create a savings goal and
            track your progress as you
            move money into it.
          </Text>

          <Pressable
            style={
              styles.emptyButton
            }
            onPress={() =>
              router.push(
                '/savings/add'
              )
            }
          >
            <Text
              style={
                styles.emptyButtonText
              }
            >
              Create Goal
            </Text>
          </Pressable>
        </Card>
      ) : (
        <View style={styles.list}>
          {goals.map((goal) => (
            <SavingsGoalCard
              key={goal.id}
              goal={goal}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function SavingsGoalCard({
  goal,
}: {
  goal: SavingsGoalListItem;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const rawProgress =
    goal.currentAmountMinor /
    goal.targetAmountMinor;

  const progress =
    Math.max(
      0,
      Math.min(
        rawProgress,
        1
      )
    );

  const percentage =
    Math.round(
      rawProgress * 100
    );

  return (
    <Card
      style={styles.goalCard}
    >
     <Pressable
  style={
    styles.goalHeader
  }
  onPress={() =>
    router.push({
      pathname:
        '/savings/[id]',

      params: {
        id: goal.id,
      },
    })
  }
>
        <View
          style={
            styles.goalIcon
          }
        >
          <Ionicons
            name={
              (goal.icon ??
                'flag-outline') as keyof typeof Ionicons.glyphMap
            }
            size={22}
            color={colors.primary}
          />
        </View>

        <View
          style={
            styles.goalHeading
          }
        >
          <Text
            style={styles.goalName}
          >
            {goal.name}
          </Text>

          <Text
            style={styles.goalMeta}
          >
            {percentage}% complete
          </Text>
        </View>
        <Ionicons
  name="chevron-forward"
  size={18}
  color={colors.textMuted}
/>
      </Pressable>

      <View
        style={styles.moneyRow}
      >
        <Text
          style={
            styles.currentAmount
          }
        >
          {formatMoney(
            goal.currentAmountMinor,
            goal.currency
          )}
        </Text>

        <Text
          style={
            styles.targetAmount
          }
        >
          of{' '}
          {formatMoney(
            goal.targetAmountMinor,
            goal.currency
          )}
        </Text>
      </View>

      <View
        style={
          styles.progressTrack
        }
      >
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

      <View
        style={
          styles.remainingRow
        }
      >
        <Text
          style={
            styles.remainingText
          }
        >
          {goal.currentAmountMinor >=
          goal.targetAmountMinor
            ? 'Goal reached 🎉'
            : `${formatMoney(
                goal.targetAmountMinor -
                  goal.currentAmountMinor,
                goal.currency
              )} remaining`}
        </Text>
      </View>
      <View style={styles.goalActions}>
  <Pressable
    style={styles.addMoneyButton}
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
      size={18}
      color={colors.textInverse}
    />

    <Text
      style={
        styles.addMoneyButtonText
      }
    >
      Add Money
    </Text>
  </Pressable>

  <Pressable
    style={[
      styles.withdrawButton,
      goal.currentAmountMinor <= 0 &&
        styles.disabledAction,
    ]}
    disabled={
      goal.currentAmountMinor <= 0
    }
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
      size={17}
      color={
        goal.currentAmountMinor <= 0
          ? colors.textMuted
          : colors.text
      }
    />

    <Text
      style={[
        styles.withdrawButtonText,
        goal.currentAmountMinor <= 0 &&
          styles.disabledActionText,
      ]}
    >
      Withdraw
    </Text>
  </Pressable>
</View>
    </Card>
  );
}

const useStyles =
  createThemedStyles((colors) => StyleSheet.create({
    content: {
      paddingBottom: 120,
    },

    header: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom:
        spacing.xxxl,
    },

    subtitle: {
      color:
        colors.textSecondary,
      fontSize: 13,
      marginBottom:
        spacing.xs,
    },

    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
    },

    addButton: {
      width: 46,
      height: 46,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.primarySolid,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    list: {
      gap: spacing.md,
    },

    goalCard: {
      padding: spacing.xl,
    },

    goalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom:
        spacing.xl,
    },

    goalIcon: {
      width: 46,
      height: 46,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.primarySoft,
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight:
        spacing.md,
    },

    goalHeading: {
      flex: 1,
    },

    goalName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
    },

    goalMeta: {
      color:
        colors.textMuted,
      fontSize: 11,
      marginTop:
        spacing.xs,
    },

    moneyRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
      marginBottom:
        spacing.md,
    },

    currentAmount: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
    },

    targetAmount: {
      color:
        colors.textSecondary,
      fontSize: 12,
    },

    progressTrack: {
      height: 8,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.border,
      overflow: 'hidden',
    },

    progressFill: {
      height: '100%',
      borderRadius:
        radius.full,
      backgroundColor:
        colors.primary,
    },

    remainingRow: {
      marginTop:
        spacing.md,
    },

    remainingText: {
      color:
        colors.textSecondary,
      fontSize: 11,
    },

    emptyCard: {
      alignItems: 'center',
      paddingVertical:
        spacing.xxxl,
    },

    emptyIcon: {
      width: 60,
      height: 60,
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

    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom:
        spacing.sm,
    },

    emptyDescription: {
      color:
        colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },

    emptyButton: {
      height: 46,
      paddingHorizontal:
        spacing.xxl,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.primarySolid,
      alignItems: 'center',
      justifyContent:
        'center',
      marginTop:
        spacing.xl,
    },

    emptyButtonText: {
      color:
        colors.textInverse,
      fontWeight: '700',
    },
    goalActions: {
  flexDirection: 'row',
  gap: spacing.sm,
  marginTop: spacing.xl,
},

addMoneyButton: {
  flex: 1,
  height: 46,
  borderRadius: radius.md,
  backgroundColor: colors.primarySolid,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.xs,
},

addMoneyButtonText: {
  color: colors.textInverse,
  fontSize: 13,
  fontWeight: '700',
},

withdrawButton: {
  flex: 1,
  height: 46,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.xs,
},

withdrawButtonText: {
  color: colors.text,
  fontSize: 13,
  fontWeight: '700',
},

disabledAction: {
  opacity: 0.45,
},

disabledActionText: {
  color: colors.textMuted,
},
  }));
