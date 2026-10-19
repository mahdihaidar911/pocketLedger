import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityRow, Card, Screen } from '../../components';
import { HomeBudgets } from '../../components/HomeBudgets';
import { ScreenState } from '../../components/ScreenState';
import { useDashboard } from '../../hooks/useDashboard';
import { usePhoneLayout } from '../../hooks/usePhoneLayout';
import type { ExpenseTotals } from '../../repositories/transactionRepository';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import { convertLbpToUsdMinor, formatMoney, getNextRecurringDate, getTodayDateOnly, greetingForNow } from '../../utils';

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { compact } = usePhoneLayout();
  const { data, loading, error, retry } = useDashboard();

  if (loading || error || !data) return <Screen bottomInset={false} scroll contentStyle={styles.content}>
    <Text style={[styles.title, styles.stateTitle]}>Home</Text>
    <ScreenState loading={loading}
      title={loading ? 'Loading your dashboard' : 'Unable to load dashboard'}
      message={loading ? 'Checking your saved balances and activity.' : 'Your saved data has not been changed. Try loading it again.'}
      onRetry={retry} />
  </Screen>;

  const { accounts, recentTransactions, todayTotals, weekTotals, monthTotals, exchangeRate, upcomingRecurring } = data;

  const totalUsd = accounts
    .filter(
      (account) =>
        account.currency === 'USD'
    )
    .reduce(
      (total, account) =>
        total +
        account.balanceMinor,
      0
    );

  const totalLbp = accounts
    .filter(
      (account) =>
        account.currency === 'LBP'
    )
    .reduce(
      (total, account) =>
        total +
        account.balanceMinor,
      0
    );
    const totalAvailableUsdMinor =
  exchangeRate
    ? totalUsd +
      convertLbpToUsdMinor(
        totalLbp,
        exchangeRate.lbpPerUsd
      )
    : totalUsd;


  return (
    <Screen bottomInset={false}
      scroll
      contentStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <Text style={styles.greeting}>
            {greetingForNow()}
          </Text>

          <Text style={[styles.title, compact && styles.compactTitle]}>
            PocketLedger
          </Text>
        </View>

        {!compact && <View
          style={
            styles.profileButton
          }
        >
          <Text
            style={styles.profileText}
          >
            M
          </Text>
        </View>}
      </View>

      <View
        style={[styles.balanceCard, compact && styles.compactBalanceCard]}
      >
        <Text
          style={styles.balanceLabel}
        >
          Available Balance
        </Text>

        <Text
          style={[styles.balanceValue, compact && styles.compactBalance,
            compact && formatMoney(totalAvailableUsdMinor, 'USD').length > 11 && styles.longBalance]}
        >
         {formatMoney(
  totalAvailableUsdMinor,
  'USD'
)}
        </Text>

        <Text
          style={
            styles.balanceSecondary
          }
        >
          {exchangeRate
  ? `${formatMoney(
      totalUsd,
      'USD'
    )} + ${formatMoney(
      totalLbp,
      'LBP'
    )}`
  : `${formatMoney(
      totalUsd,
      'USD'
    )} • Exchange rate not set`}
        </Text>
      </View>

      <View
        style={styles.periodSection}
      >
        <SummaryCard
          label="Today"
          totals={todayTotals}
        />

        <SummaryCard
          label="This Week"
          totals={weekTotals}
        />

        <SummaryCard
          label="This Month"
          totals={monthTotals}
        />
      </View>

      <HomeBudgets />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Upcoming Due
        </Text>

        <Pressable
          onPress={() =>
            router.push('/recurring')
          }
        >
          <Text style={styles.sectionAction}>
            View all
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <Card style={styles.upcomingEmpty}>
          <Text style={styles.emptyDescription}>
            Loading scheduled payments...
          </Text>
        </Card>
      ) : upcomingRecurring.length === 0 ? (
        <Card style={styles.upcomingEmpty}>
          <Text style={styles.emptyTitle}>
            Nothing due soon
          </Text>
          <Text style={styles.emptyDescription}>
            Active recurring payments due in the next seven days will appear here.
          </Text>
        </Card>
      ) : (
        <View style={styles.upcomingList}>
          {upcomingRecurring.map((item) => (
            <Pressable
              key={item.id}
              onPress={() =>
                router.push({
                  pathname: '/recurring/[id]',
                  params: { id: item.id },
                })
              }
            >
              <Card style={styles.upcomingCard}>
                <View style={styles.upcomingRow}>
                  <View style={styles.upcomingIcon}>
                    <Ionicons
                      name={(item.categoryIcon ?? 'repeat-outline') as keyof typeof Ionicons.glyphMap}
                      size={19}
                      color={item.type === 'expense' ? colors.expense : colors.income}
                    />
                  </View>

                  <View style={styles.upcomingDetails}>
                    <Text style={styles.upcomingName} numberOfLines={compact ? undefined : 1}>
                      {item.name}
                    </Text>
                    <Text style={styles.upcomingMeta} numberOfLines={compact ? undefined : 1}>
                      {formatDueLabel(item.nextDueDate)} · {item.accountName}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.upcomingAmount,
                      (compact || formatMoney(item.amountMinor, item.currency).length > 16) && styles.stackedAmount,
                      item.type === 'expense'
                        ? styles.upcomingExpense
                        : styles.upcomingIncome,
                    ]}
                  >
                    {item.type === 'expense' ? '-' : '+'}
                    {formatMoney(item.amountMinor, item.currency)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <View
        style={styles.sectionHeader}
      >
        <Text
          style={styles.sectionTitle}
        >
          Accounts
        </Text>

        <Pressable
          onPress={() =>
            router.push('/accounts')
          }
        >
          <Text
            style={styles.sectionAction}
          >
            View all
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <Card
          style={styles.emptyCard}
        >
          <Text
            style={
              styles.emptyDescription
            }
          >
            Loading accounts...
          </Text>
        </Card>
      ) : accounts.length === 0 ? (
        <Card
          style={styles.emptyCard}
        >
          <Text
            style={styles.emptyTitle}
          >
            No accounts yet
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            Add an account to start
            tracking your money.
          </Text>

          <Pressable
            style={
              styles.addAccountButton
            }
            onPress={() =>
              router.push(
                '/accounts/add'
              )
            }
          >
            <Text
              style={
                styles.addAccountButtonText
              }
            >
              Add your first account
            </Text>
          </Pressable>
        </Card>
      ) : (
        <View
          style={styles.accountList}
        >
          {accounts
            .slice(0, 4)
            .map((account) => (
              <Pressable
                key={account.id}
                onPress={() =>
                  router.push({
                    pathname:
                      '/accounts/[id]',
                    params: {
                      id: account.id,
                    },
                  })
                }
              >
                <Card
                  style={
                    styles.accountCard
                  }
                >
                  <View
                    style={
                      [styles.accountRow, compact && styles.stackedRow]
                    }
                  >
                    <View style={styles.accountIdentity}>
                      <Text
                        style={
                          styles.accountName
                        }
                      >
                        {account.name}
                      </Text>

                      <Text
                        style={
                          styles.accountMeta
                        }
                      >
                        {account.type.toUpperCase()}
                        {' • '}
                        {account.currency}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.accountRight
                      }
                    >
                      <Text
                        style={
                          styles.accountBalance
                        }
                      >
                        {formatMoney(
                          account.balanceMinor,
                          account.currency
                        )}
                      </Text>

                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={
                          colors.textMuted
                        }
                      />
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
        </View>
      )}

      <View
        style={styles.sectionHeader}
      >
        <Text
          style={styles.sectionTitle}
        >
          Recent Transactions
        </Text>

        <Pressable
          onPress={() =>
            router.push(
              '/transactions'
            )
          }
        >
          <Text
            style={styles.sectionAction}
          >
            View all
          </Text>
        </Pressable>
      </View>

      {recentTransactions.length ===
      0 ? (
        <Card
          style={styles.emptyCard}
        >
          <Text
            style={styles.emptyTitle}
          >
            Nothing here yet
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            Your latest expenses and
            income will appear here.
          </Text>
        </Card>
      ) : (
        <View
          style={
            styles.transactionList
          }
        >
          {recentTransactions.map(
            (transaction) => (
              <ActivityRow
  key={`${transaction.kind}-${transaction.data.id}`}
  activity={transaction}
/>
            )
          )}
        </View>
      )}
    </Screen>
  );
}

function SummaryCard({
  label,
  totals,
}: {
  label: string;
  totals: ExpenseTotals;
}) {
  const styles = useStyles();
  const { summaryMinWidth } = usePhoneLayout();
  return (
    <Card style={[styles.summaryCard, { flexBasis: summaryMinWidth }]}>
      <Text
        style={styles.summaryLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.summaryValue}
      >
        {formatMoney(
          totals.usdMinor,
          'USD'
        )}
      </Text>

      <Text
        style={styles.summaryLbp}
      >
        {formatMoney(
          totals.lbpMinor,
          'LBP'
        )}
      </Text>

      <Text
        style={styles.summaryCaption}
      >
        spent
      </Text>
    </Card>
  );
}

function formatDueLabel(date: string): string {
  const today = getTodayDateOnly();

  if (date < today) return 'Overdue';
  if (date === today) return 'Due today';
  if (date === getNextRecurringDate(today, 'daily')) return 'Due tomorrow';

  return `Due ${date}`;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  stateTitle: { marginBottom: spacing.xl },

  header: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  headerIdentity: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  compactTitle: { fontSize: 22 },
  compactBalanceCard: { padding: spacing.lg },
  compactBalance: { fontSize: 24 },
  longBalance: { fontSize: 16 },

  greeting: {
    fontSize: 14,
    color:
      colors.textSecondary,
    marginBottom: spacing.xs,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },

  profileButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor:
      colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      colors.border,
  },

  profileText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  balanceCard: {
    backgroundColor:
      colors.surfaceDark,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
  },

  balanceLabel: {
    color: colors.heroMuted,
    fontSize: 14,
    marginBottom: spacing.sm,
  },

  balanceValue: {
    color:
      colors.textInverse,
    fontSize: 36,
    fontWeight: '700',
  },

  balanceSecondary: {
    color: colors.heroMuted,
    fontSize: 14,
    marginTop: spacing.sm,
  },

  periodSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom:
      spacing.xxxl,
  },

  summaryCard: {
    flex: 1,
    maxWidth: '100%',
    padding: spacing.md,
  },

  summaryLabel: {
    fontSize: 13,
    color:
      colors.textSecondary,
    marginBottom: spacing.sm,
  },

  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  summaryLbp: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  summaryCaption: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  sectionAction: {
    minHeight: 44,
    paddingVertical: spacing.md,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  upcomingEmpty: {
    marginBottom: spacing.xxxl,
  },

  upcomingList: {
    gap: spacing.sm,
    marginBottom: spacing.xxxl,
  },

  upcomingCard: {
    padding: spacing.lg,
  },

  upcomingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  upcomingIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  upcomingDetails: {
    flex: 1,
    minWidth: 0,
  },

  upcomingName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  upcomingMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
  },

  upcomingAmount: {
    flexShrink: 1,
    maxWidth: '55%',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },

  upcomingExpense: {
    color: colors.expense,
  },

  upcomingIncome: {
    color: colors.income,
  },

  emptyCard: {
    marginBottom:
      spacing.xxxl,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  emptyDescription: {
    fontSize: 13,
    lineHeight: 19,
    color:
      colors.textSecondary,
  },

  addAccountButton: {
    minHeight: 46,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor:
      colors.primarySolid,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },

  addAccountButtonText: {
    color:
      colors.textInverse,
    fontWeight: '700',
  },

  accountList: {
    gap: spacing.sm,
    marginBottom:
      spacing.xxxl,
  },

  accountCard: {
    padding: spacing.lg,
  },

  accountRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
  },

  accountName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  accountMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  accountRight: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  accountBalance: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  transactionList: {
    gap: spacing.sm,
    marginBottom:
      spacing.xxxl,
  },
  accountIdentity: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  stackedRow: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  stackedAmount: { width: '100%', maxWidth: '100%', marginLeft: 0, marginTop: spacing.md },
}));
