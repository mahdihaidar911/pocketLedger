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
    getRecurringPaymentById,
    recordRecurringPayment,
    setRecurringPaymentActive,
    skipRecurringPayment,
} from '../../repositories/recurringPaymentRepository';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';
import {
    syncRecurringReminders,
} from '../../services';

import type {
    RecurringPaymentListItem,
} from '../../types';

import {
    formatMoney,
    formatRecurringFrequency,
    getTodayDateOnly,
} from '../../utils';

export default function RecurringDetailsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db =
    useSQLiteContext();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [
    item,
    setItem,
  ] =
    useState<
      RecurringPaymentListItem | null
    >(null);

  const [loading, setLoading] =
    useState(true);

  const [working, setWorking] =
    useState(false);

  const load =
    useCallback(async () => {
      if (!id) {
        return;
      }

      try {
        setLoading(true);

        const result =
          await getRecurringPaymentById(
            db,
            id
          );

        setItem(result);
      } catch (error) {
        console.error(
          'Failed to load recurring payment:',
          error
        );
      } finally {
        setLoading(false);
      }
    }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRecord() {
    if (!item || working) {
      return;
    }

    const action =
      item.type === 'expense'
        ? 'Record payment'
        : 'Record income';

    Alert.alert(
      action,
      `${formatMoney(
        item.amountMinor,
        item.currency
      )} will be ${
        item.type === 'expense'
          ? 'deducted from'
          : 'added to'
      } ${item.accountName}.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text:
            item.type === 'expense'
              ? 'Record'
              : 'Receive',

          onPress: async () => {
            try {
              setWorking(true);

              const result =
                await recordRecurringPayment(
                  db,
                  item.id
                );

              await syncRecurringReminders(
                db
              );

              await load();

              Alert.alert(
                item.type === 'expense'
                  ? 'Payment recorded'
                  : 'Income recorded',
                `Next due date: ${result.nextDueDate}`
              );
            } catch (error) {
              console.error(
                'Failed to record recurring payment:',
                error
              );

              Alert.alert(
                'Unable to record',
                error instanceof Error
                  ? error.message
                  : 'Something went wrong.'
              );
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  }

  function handleSkip() {
    if (!item || working) {
      return;
    }

    Alert.alert(
      'Skip this occurrence?',
      `No transaction will be created for ${item.nextDueDate}.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Skip',

          onPress: async () => {
            try {
              setWorking(true);

              const next =
                await skipRecurringPayment(
                  db,
                  item.id
                );

              await syncRecurringReminders(
                db
              );

              await load();

              Alert.alert(
                'Occurrence skipped',
                `Next due date: ${next}`
              );
            } catch (error) {
              console.error(
                'Failed to skip recurring payment:',
                error
              );

              Alert.alert(
                'Unable to skip',
                error instanceof Error
                  ? error.message
                  : 'Something went wrong.'
              );
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  }

  async function handleToggleActive() {
    if (!item || working) {
      return;
    }

    try {
      setWorking(true);

      await setRecurringPaymentActive(
        db,
        item.id,
        !item.isActive
      );

      await syncRecurringReminders(
        db
      );

      await load();
    } catch (error) {
      console.error(
        'Failed to change recurring status:',
        error
      );

      Alert.alert(
        'Unable to update',
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Text style={styles.loading}>
          Loading...
        </Text>
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen>
        <Card>
          <Text
            style={styles.notFound}
          >
            Recurring payment not found.
          </Text>
        </Card>
      </Screen>
    );
  }

  const today =
    getTodayDateOnly();

  const overdue =
    item.nextDueDate < today;

  const dueToday =
    item.nextDueDate === today;

  const isExpense =
    item.type === 'expense';

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

        <Text
          style={styles.headerTitle}
        >
          Recurring
        </Text>

        <Pressable
          style={styles.headerButton}
          onPress={() =>
            router.push({
              pathname: '/recurring/edit/[id]',
              params: { id: item.id },
            })
          }
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={colors.primary}
          />
        </Pressable>
      </View>

      <Card style={styles.hero}>
        <View
          style={styles.iconBox}
        >
          <Ionicons
            name={
              (item.categoryIcon ??
                'repeat-outline') as keyof typeof Ionicons.glyphMap
            }
            size={27}
            color={
              isExpense
                ? colors.expense
                : colors.income
            }
          />
        </View>

        <Text style={styles.name}>
          {item.name}
        </Text>

        <Text
          style={[
            styles.amount,

            isExpense
              ? styles.expense
              : styles.income,
          ]}
        >
          {isExpense ? '-' : '+'}
          {formatMoney(
            item.amountMinor,
            item.currency
          )}
        </Text>

        <View
          style={[
            styles.statusBadge,

            !item.isActive &&
              styles.pausedBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,

              !item.isActive &&
                styles.pausedText,
            ]}
          >
            {item.isActive
              ? formatRecurringFrequency(
                  item.frequency
                )
              : 'Paused'}
          </Text>
        </View>
      </Card>

      <Card style={styles.detailsCard}>
        <DetailRow
          label="Account"
          value={item.accountName}
        />

        <DetailRow
          label="Category"
          value={
            item.categoryName ??
            'Uncategorized'
          }
        />

        <DetailRow
          label="Frequency"
          value={
            item.intervalCount === 1
              ? formatRecurringFrequency(
                  item.frequency
                )
              : `Every ${item.intervalCount} ${item.frequency}`
          }
        />

        <DetailRow
          label="Next due"
          value={item.nextDueDate}
          valueStyle={
            overdue
              ? styles.overdueText
              : dueToday
                ? styles.dueTodayText
                : undefined
          }
        />

        {item.merchant && (
          <DetailRow
            label={
              isExpense
                ? 'Merchant'
                : 'Source'
            }
            value={item.merchant}
          />
        )}

        {item.note && (
          <DetailRow
            label="Note"
            value={item.note}
          />
        )}
      </Card>

      {item.isActive && (
        <>
          <Pressable
            style={[
              styles.recordButton,
              working &&
                styles.disabled,
            ]}
            disabled={working}
            onPress={handleRecord}
          >
            <Ionicons
              name={
                isExpense
                  ? 'checkmark-circle-outline'
                  : 'cash-outline'
              }
              size={20}
              color={
                colors.textInverse
              }
            />

            <Text
              style={
                styles.recordButtonText
              }
            >
              {working
                ? 'Working...'
                : isExpense
                  ? 'Record Payment'
                  : 'Record Income'}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.skipButton,
              working &&
                styles.disabled,
            ]}
            disabled={working}
            onPress={handleSkip}
          >
            <Ionicons
              name="play-skip-forward-outline"
              size={18}
              color={colors.text}
            />

            <Text
              style={
                styles.skipButtonText
              }
            >
              Skip This Occurrence
            </Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={[
          styles.pauseButton,
          working &&
            styles.disabled,
        ]}
        disabled={working}
        onPress={
          handleToggleActive
        }
      >
        <Ionicons
          name={
            item.isActive
              ? 'pause-circle-outline'
              : 'play-circle-outline'
          }
          size={18}
          color={
            item.isActive
              ? colors.warning
              : colors.income
          }
        />

        <Text
          style={[
            styles.pauseText,

            !item.isActive &&
              styles.resumeText,
          ]}
        >
          {item.isActive
            ? 'Pause Recurring Payment'
            : 'Resume Recurring Payment'}
        </Text>
      </Pressable>
    </Screen>
  );
}

function DetailRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  const styles = useStyles();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.detailValue,
          valueStyle,
        ]}
      >
        {value}
      </Text>
    </View>
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

    notFound: {
      color: colors.text,
      fontWeight: '700',
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
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    headerSpacer: {
      width: 42,
    },

    headerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },

    hero: {
      alignItems: 'center',
      padding: spacing.xxl,
      marginBottom:
        spacing.lg,
    },

    iconBox: {
      width: 60,
      height: 60,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.surfaceMuted,
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom:
        spacing.lg,
    },

    name: {
      color: colors.text,
      fontSize: 21,
      fontWeight: '700',
    },

    amount: {
      fontSize: 30,
      fontWeight: '700',
      marginTop:
        spacing.sm,
    },

    expense: {
      color: colors.expense,
    },

    income: {
      color: colors.income,
    },

    statusBadge: {
      marginTop:
        spacing.lg,
      borderRadius:
        radius.full,
      paddingHorizontal:
        spacing.md,
      paddingVertical:
        spacing.xs,
      backgroundColor:
        colors.primarySoft,
    },

    statusText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },

    pausedBadge: {
      backgroundColor:
        colors.surfaceMuted,
    },

    pausedText: {
      color:
        colors.textSecondary,
    },

    detailsCard: {
      marginBottom:
        spacing.xxl,
    },

    detailRow: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      gap: spacing.lg,
      paddingVertical:
        spacing.md,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        colors.border,
    },

    detailLabel: {
      color:
        colors.textSecondary,
      fontSize: 12,
    },

    detailValue: {
      flex: 1,
      textAlign: 'right',
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },

    overdueText: {
      color: colors.danger,
    },

    dueTodayText: {
      color: colors.warning,
    },

    recordButton: {
      height: 56,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.primarySolid,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'center',
      gap: spacing.sm,
      marginBottom:
        spacing.sm,
    },

    recordButtonText: {
      color:
        colors.textInverse,
      fontSize: 15,
      fontWeight: '700',
    },

    skipButton: {
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
      gap: spacing.sm,
      marginBottom:
        spacing.sm,
    },

    skipButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },

    pauseButton: {
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
      gap: spacing.sm,
      marginTop:
        spacing.lg,
    },

    pauseText: {
      color: colors.warning,
      fontSize: 13,
      fontWeight: '700',
    },

    resumeText: {
      color: colors.income,
    },

    disabled: {
      opacity: 0.55,
    },
  }));
