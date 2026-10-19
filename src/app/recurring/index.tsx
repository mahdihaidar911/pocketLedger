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
    getRecurringPayments,
} from '../../repositories/recurringPaymentRepository';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';

import type {
    RecurringPaymentListItem,
} from '../../types';

import {
    formatMoney,
    formatRecurringFrequency,
    getTodayDateOnly,
} from '../../utils';

export default function RecurringPaymentsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db =
    useSQLiteContext();

  const [
    items,
    setItems,
  ] =
    useState<
      RecurringPaymentListItem[]
    >([]);

  const [loading, setLoading] =
    useState(true);

  const load =
    useCallback(async () => {
      try {
        setLoading(true);

        const result =
          await getRecurringPayments(
            db
          );

        setItems(result);
      } catch (error) {
        console.error(
          'Failed to load recurring payments:',
          error
        );
      } finally {
        setLoading(false);
      }
    }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen
      scroll
      contentStyle={
        styles.content
      }
    >
      <View style={styles.header}>
        <View>
          <Text
            style={styles.subtitle}
          >
            Bills, subscriptions and income
          </Text>

          <Text style={styles.title}>
            Recurring
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() =>
            router.push(
              '/recurring/add'
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
            Loading...
          </Text>
        </Card>
      ) : items.length === 0 ? (
        <Card
          style={styles.emptyCard}
        >
          <View
            style={styles.emptyIcon}
          >
            <Ionicons
              name="repeat-outline"
              size={28}
              color={colors.primary}
            />
          </View>

          <Text
            style={styles.emptyTitle}
          >
            Nothing scheduled yet
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            Add recurring bills,
            subscriptions, salaries or
            other repeating money.
          </Text>

          <Pressable
            style={styles.emptyButton}
            onPress={() =>
              router.push(
                '/recurring/add'
              )
            }
          >
            <Text
              style={
                styles.emptyButtonText
              }
            >
              Add Recurring Payment
            </Text>
          </Pressable>
        </Card>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <RecurringCard
              key={item.id}
              item={item}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function RecurringCard({
  item,
}: {
  item: RecurringPaymentListItem;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isExpense =
    item.type === 'expense';

  const today =
    getTodayDateOnly();

  const overdue =
    item.nextDueDate < today;

  const dueToday =
    item.nextDueDate === today;

  return (
    <Pressable
  onPress={() =>
    router.push({
      pathname:
        '/recurring/[id]',
      params: {
        id: item.id,
      },
    })
  }
>
    <Card style={styles.card}>
      <View style={styles.cardRow}>
        <View
          style={styles.iconBox}
        >
          <Ionicons
            name={
              (item.categoryIcon ??
                'repeat-outline') as keyof typeof Ionicons.glyphMap
            }
            size={21}
            color={
              isExpense
                ? colors.expense
                : colors.income
            }
          />
        </View>

        <View style={styles.main}>
          <Text style={styles.name}>
            {item.name}
          </Text>

          <Text
            style={styles.meta}
          >
            {item.categoryName ??
              (isExpense
                ? 'Expense'
                : 'Income')}
            {' • '}
            {item.accountName}
          </Text>

          <Text
            style={[
              styles.due,

              overdue &&
                styles.overdue,

              dueToday &&
                styles.dueToday,
            ]}
          >
            {overdue
              ? `Overdue • ${item.nextDueDate}`
              : dueToday
                ? 'Due today'
                : `Next • ${item.nextDueDate}`}
          </Text>
        </View>

        <View
          style={styles.right}
        >
          <Text
            style={[
              styles.amount,

              isExpense
                ? styles.expense
                : styles.income,
            ]}
          >
            {isExpense
              ? '-'
              : '+'}
            {formatMoney(
              item.amountMinor,
              item.currency
            )}
          </Text>

          <Text
            style={
              styles.frequency
            }
          >
            {formatRecurringFrequency(
              item.frequency
            )}
          </Text>
            <Ionicons
  name="chevron-forward"
  size={14}
  color={colors.textMuted}
/>
        </View>
      </View>
    </Card>
  
    </Pressable>
    
  );
}

const useStyles =
  createThemedStyles((colors) => StyleSheet.create({
    content: {
      paddingBottom: 80,
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
      gap: spacing.sm,
    },

    card: {
      padding: spacing.lg,
    },

    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    iconBox: {
      width: 46,
      height: 46,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight:
        spacing.md,
    },

    main: {
      flex: 1,
    },

    name: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },

    meta: {
      color:
        colors.textMuted,
      fontSize: 10,
      marginTop:
        spacing.xs,
    },

    due: {
      color:
        colors.textSecondary,
      fontSize: 10,
      marginTop:
        spacing.xs,
    },

    overdue: {
      color: colors.danger,
      fontWeight: '700',
    },

    dueToday: {
      color: colors.warning,
      fontWeight: '700',
    },

    right: {
      alignItems: 'flex-end',
      marginLeft:
        spacing.sm,
    },

    amount: {
      fontSize: 14,
      fontWeight: '700',
    },

    expense: {
      color: colors.expense,
    },

    income: {
      color: colors.income,
    },

    frequency: {
      color:
        colors.textMuted,
      fontSize: 10,
      marginTop:
        spacing.xs,
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
      borderRadius:
        radius.md,
      backgroundColor:
        colors.primarySolid,
      paddingHorizontal:
        spacing.xl,
      alignItems: 'center',
      justifyContent:
        'center',
      marginTop:
        spacing.xl,
    },

    emptyButtonText: {
      color:
        colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
  }));
