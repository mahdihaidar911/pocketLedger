import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Screen } from '../../components';
import { usePhoneLayout } from '../../hooks/usePhoneLayout';
import { getAccounts } from '../../repositories/accountRepository';
import { getCurrentExchangeRate } from '../../repositories/exchangeRateRepository';
import { getMonthlyReport } from '../../repositories/reportRepository';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import type {
  Account,
  CategoryTotal,
  MonthlyReport,
  ReportCurrencyTotals,
} from '../../types';
import { formatMoney } from '../../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'monthly' | 'custom';

type DateRange = {
  label: string;
  startIso: string;
  endIso: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthPeriod(offset: number): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return {
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(start),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function getBarWidth(value: number, maximum: number): `${number}%` {
  if (value <= 0 || maximum <= 0) return '0%';
  return `${Math.max(4, (value / maximum) * 100)}%`;
}

/**
 * Parse a user-typed date string in YYYY-MM-DD format into a Date.
 * Returns null if the string is not a valid calendar date.
 */
function parseUserDate(raw: string): Date | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) return null;
  return date;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();

  // ── Period state ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [monthOffset, setMonthOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // ── Report state ────────────────────────────────────────────────────────────
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const monthPeriod = useMemo(() => getMonthPeriod(monthOffset), [monthOffset]);
  const activePeriod = viewMode === 'monthly' ? monthPeriod : customRange;

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadReport = useCallback(async () => {
    if (!activePeriod) return;
    try {
      setLoading(true);
      setError(false);
      const [accountList, exchangeRate] = await Promise.all([
        getAccounts(db),
        getCurrentExchangeRate(db),
      ]);
      setAccounts(accountList);
      const data = await getMonthlyReport(
        db,
        activePeriod.startIso,
        activePeriod.endIso,
        selectedAccountId,
        exchangeRate?.lbpPerUsd ?? null
      );
      setReport(data);
    } catch (loadError) {
      console.error('Failed to load report:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [db, activePeriod, selectedAccountId]);

  useFocusEffect(useCallback(() => void loadReport(), [loadReport]));

  // ── Custom range apply ──────────────────────────────────────────────────────

  function applyCustomRange() {
    const from = parseUserDate(customFrom.trim());
    const to = parseUserDate(customTo.trim());
    if (!from) {
      Alert.alert('Invalid from date', 'Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (!to) {
      Alert.alert('Invalid to date', 'Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (from >= to) {
      Alert.alert('Invalid range', 'The from date must be before the to date.');
      return;
    }
    // endIso is exclusive — advance to end of the "to" day
    const endExclusive = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    setCustomRange({
      label: `${customFrom.trim()} → ${customTo.trim()}`,
      startIso: from.toISOString(),
      endIso: endExclusive.toISOString(),
    });
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  return (
    <Screen bottomInset={false} scroll={false} contentStyle={styles.wrapper}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>
          Review income, spending, and cash flow for any period.
        </Text>

        {/* ── View mode toggle ── */}
        <ViewModeToggle mode={viewMode} onChange={(m) => { setViewMode(m); setCustomRange(null); }} />

        {/* ── Monthly navigator ── */}
        {viewMode === 'monthly' && (
          <MonthNavigator
            offset={monthOffset}
            label={monthPeriod.label}
            onPrev={() => setMonthOffset((v) => v - 1)}
            onNext={() => setMonthOffset((v) => Math.min(0, v + 1))}
            onToday={() => setMonthOffset(0)}
          />
        )}

        {/* ── Custom range inputs ── */}
        {viewMode === 'custom' && (
          <CustomRangeInputs
            from={customFrom}
            to={customTo}
            onFromChange={setCustomFrom}
            onToChange={setCustomTo}
            onApply={applyCustomRange}
            activeRange={customRange}
          />
        )}

        {/* ── Account filter ── */}
        <AccountFilterRow
          accounts={accounts}
          selectedAccount={selectedAccount}
          showPicker={showAccountPicker}
          onTogglePicker={() => setShowAccountPicker((v) => !v)}
          onSelect={(id) => { setSelectedAccountId(id); setShowAccountPicker(false); }}
        />

        {/* ── Report body ── */}
        {viewMode === 'custom' && !customRange ? (
          <Card>
            <Text style={styles.hintText}>
              Enter a from and to date above, then tap Apply to generate your custom report.
            </Text>
          </Card>
        ) : loading ? (
          <Card><Text style={styles.secondaryText}>Loading report…</Text></Card>
        ) : error || !report ? (
          <Card>
            <Text style={styles.emptyTitle}>Unable to load report</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadReport()}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </Card>
        ) : (
          <ReportContent report={report} />
        )}
      </ScrollView>
    </Screen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.modeToggle}>
      {(['monthly', 'custom'] as ViewMode[]).map((m) => (
        <Pressable
          key={m}
          style={[styles.modeChip, mode === m && { backgroundColor: colors.primary }]}
          onPress={() => onChange(m)}
        >
          <Text style={[styles.modeChipText, mode === m && { color: colors.textInverse }]}>
            {m === 'monthly' ? 'Monthly' : 'Custom Range'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MonthNavigator({
  offset, label, onPrev, onNext, onToday,
}: {
  offset: number;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.periodSelector}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        style={styles.periodButton}
        onPress={onPrev}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>

      <View style={styles.periodCenter}>
        <Text style={styles.periodLabel}>{label}</Text>
        {offset !== 0 && (
          <Pressable onPress={onToday}>
            <Text style={styles.currentMonthAction}>Return to this month</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: offset === 0 }}
        style={[styles.periodButton, offset === 0 && styles.disabledButton]}
        disabled={offset === 0}
        onPress={onNext}
      >
        <Ionicons
          name="chevron-forward"
          size={20}
          color={offset === 0 ? colors.textMuted : colors.text}
        />
      </Pressable>
    </View>
  );
}

function CustomRangeInputs({
  from, to, onFromChange, onToChange, onApply, activeRange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
  activeRange: DateRange | null;
}) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  return (
    <Card style={styles.customRangeCard}>
      <Text style={styles.customRangeLabel}>From</Text>
      <TextInput
        style={styles.dateInput}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        value={from}
        onChangeText={onFromChange}
        keyboardType="numbers-and-punctuation"
        keyboardAppearance={scheme}
        maxLength={10}
        returnKeyType="next"
      />
      <Text style={styles.customRangeLabel}>To</Text>
      <TextInput
        style={styles.dateInput}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        value={to}
        onChangeText={onToChange}
        keyboardType="numbers-and-punctuation"
        keyboardAppearance={scheme}
        maxLength={10}
        returnKeyType="done"
        onSubmitEditing={onApply}
      />
      <Pressable style={styles.applyButton} onPress={onApply}>
        <Text style={styles.applyButtonText}>Apply</Text>
      </Pressable>
      {activeRange && (
        <Text style={styles.activeRangeText}>Showing: {activeRange.label}</Text>
      )}
    </Card>
  );
}

function AccountFilterRow({
  accounts, selectedAccount, showPicker, onTogglePicker, onSelect,
}: {
  accounts: Account[];
  selectedAccount: Account | null;
  showPicker: boolean;
  onTogglePicker: () => void;
  onSelect: (id: string | null) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (accounts.length === 0) return null;
  return (
    <View style={styles.filterSection}>
      <Pressable style={styles.filterButton} onPress={onTogglePicker}>
        <Ionicons name="wallet-outline" size={15} color={colors.primary} />
        <Text style={styles.filterLabel}>
          {selectedAccount ? selectedAccount.name : 'All Accounts'}
        </Text>
        <Ionicons
          name={showPicker ? 'chevron-up' : 'chevron-down'}
          size={13}
          color={colors.textMuted}
        />
      </Pressable>

      {showPicker && (
        <Card style={styles.accountPickerCard}>
          <Pressable
            style={[styles.accountOption, !selectedAccount && styles.accountOptionSelected]}
            onPress={() => onSelect(null)}
          >
            <Text style={[styles.accountOptionText, !selectedAccount && { color: colors.primary, fontWeight: '700' }]}>
              All Accounts
            </Text>
          </Pressable>
          {accounts.map((a) => (
            <Pressable
              key={a.id}
              style={[styles.accountOption, selectedAccount?.id === a.id && styles.accountOptionSelected]}
              onPress={() => onSelect(a.id)}
            >
              <Text style={[styles.accountOptionText, selectedAccount?.id === a.id && { color: colors.primary, fontWeight: '700' }]}>
                {a.name}
              </Text>
              <Text style={styles.accountOptionCurrency}>{a.currency}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

// ─── Report content ───────────────────────────────────────────────────────────

function ReportContent({ report }: { report: MonthlyReport }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const maxExpenseUsd = Math.max(0, ...report.expenseCategories.map((c) => c.usdMinor));
  const maxExpenseLbp = Math.max(0, ...report.expenseCategories.map((c) => c.lbpMinor));
  const maxIncomeUsd = Math.max(0, ...report.incomeCategories.map((c) => c.usdMinor));
  const maxIncomeLbp = Math.max(0, ...report.incomeCategories.map((c) => c.lbpMinor));

  return (
    <>
      {/* Summary cards */}
      <View style={styles.summaryGrid}>
        <SummaryCard
          icon="arrow-down-outline"
          label="Income"
          totals={report.income}
          usdEquivalentMinor={report.totalIncomeUsdEquivalentMinor}
          color={colors.income}
        />
        <SummaryCard
          icon="arrow-up-outline"
          label="Expenses"
          totals={report.expenses}
          usdEquivalentMinor={report.totalExpensesUsdEquivalentMinor}
          color={colors.expense}
        />
      </View>

      {/* Net cash flow */}
      <Card style={styles.netCard}>
        <View style={styles.netHeader}>
          <View>
            <Text style={styles.netLabel}>Net Cash Flow</Text>
            <Text style={styles.netCaption}>Income minus expenses</Text>
          </View>
          <Ionicons name="analytics-outline" size={24} color={colors.primary} />
        </View>
        <MoneyPair totals={report.net} signed />
      </Card>

      {/* Expense categories */}
      <Text style={styles.sectionTitle}>Expenses by Category</Text>
      {report.expenseCategories.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No expenses this period</Text>
          <Text style={styles.secondaryText}>Expenses will be grouped here.</Text>
        </Card>
      ) : (
        <View style={styles.categoryList}>
          {report.expenseCategories.map((cat) => (
            <CategoryRow
              key={cat.categoryId ?? 'uncategorized'}
              category={cat}
              maxUsd={maxExpenseUsd}
              maxLbp={maxExpenseLbp}
              barColor={colors.expense}
            />
          ))}
        </View>
      )}

      {/* Income categories */}
      <Text style={[styles.sectionTitle, styles.sectionTitleSpacing]}>Income by Category</Text>
      {report.incomeCategories.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No income this period</Text>
          <Text style={styles.secondaryText}>Income will be grouped here.</Text>
        </Card>
      ) : (
        <View style={styles.categoryList}>
          {report.incomeCategories.map((cat) => (
            <CategoryRow
              key={cat.categoryId ?? 'uncategorized'}
              category={cat}
              maxUsd={maxIncomeUsd}
              maxLbp={maxIncomeLbp}
              barColor={colors.income}
            />
          ))}
        </View>
      )}
    </>
  );
}

function SummaryCard({
  icon, label, totals, usdEquivalentMinor, color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  totals: ReportCurrencyTotals;
  usdEquivalentMinor: number | null;
  color: string;
}) {
  const styles = useStyles();
  const { summaryMinWidth } = usePhoneLayout();
  return (
    <Card style={[styles.summaryCard, { flexBasis: summaryMinWidth }]}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}14` }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <MoneyPair totals={totals} />
      {usdEquivalentMinor !== null && (totals.usdMinor > 0 || totals.lbpMinor > 0) && (
        <Text style={styles.usdEquivalent}>
          ≈ {formatMoney(usdEquivalentMinor, 'USD')} total
        </Text>
      )}
    </Card>
  );
}

function MoneyPair({ totals, signed = false }: {
  totals: ReportCurrencyTotals;
  signed?: boolean;
}) {
  const styles = useStyles();
  const usdPositive = totals.usdMinor >= 0;
  const lbpPositive = totals.lbpMinor >= 0;
  return (
    <View style={styles.moneyPair}>
      {totals.usdMinor !== 0 && (
        <Text style={[styles.moneyPrimary, signed && (usdPositive ? styles.positive : styles.negative)]}>
          {signed && usdPositive ? '+' : ''}{formatMoney(totals.usdMinor, 'USD')}
        </Text>
      )}
      {totals.lbpMinor !== 0 && (
        <Text style={[styles.moneySecondary, signed && (lbpPositive ? styles.positive : styles.negative)]}>
          {signed && lbpPositive ? '+' : ''}{formatMoney(totals.lbpMinor, 'LBP')}
        </Text>
      )}
      {totals.usdMinor === 0 && totals.lbpMinor === 0 && (
        <Text style={styles.moneyPrimary}>—</Text>
      )}
    </View>
  );
}

function CategoryRow({
  category, maxUsd, maxLbp, barColor,
}: {
  category: CategoryTotal;
  maxUsd: number;
  maxLbp: number;
  barColor: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const usdWidth = getBarWidth(category.usdMinor, maxUsd);
  const lbpWidth = getBarWidth(category.lbpMinor, maxLbp);

  return (
    <Card style={styles.categoryCard}>
      <View style={styles.categoryIdentity}>
        <View style={[styles.categoryIcon, { backgroundColor: `${barColor}14` }]}>
          <Ionicons
            name={(category.categoryIcon ?? 'ellipse-outline') as keyof typeof Ionicons.glyphMap}
            size={18}
            color={barColor}
          />
        </View>
        <Text style={styles.categoryName}>{category.categoryName}</Text>
      </View>

      {category.usdMinor > 0 && (
        <View style={styles.categoryCurrencyRow}>
          <Text style={styles.currencyCode}>USD</Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: usdWidth, backgroundColor: colors.primary }]} />
          </View>
          <Text style={styles.categoryAmount}>{formatMoney(category.usdMinor, 'USD')}</Text>
        </View>
      )}

      {category.lbpMinor > 0 && (
        <View style={styles.categoryCurrencyRow}>
          <Text style={styles.currencyCode}>LBP</Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: lbpWidth, backgroundColor: colors.warning }]} />
          </View>
          <Text style={styles.categoryAmount}>{formatMoney(category.lbpMinor, 'LBP')}</Text>
        </View>
      )}
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((colors) =>
  StyleSheet.create({
    wrapper: { flex: 1 },
    content: { paddingBottom: 120, paddingHorizontal: spacing.lg },

    title: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: spacing.xxl },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: spacing.sm,
      marginBottom: spacing.xxl,
    },

    // Mode toggle
    modeToggle: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    modeChip: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    modeChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },

    // Period selector
    periodSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xxl,
    },
    periodButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabledButton: { opacity: 0.5 },
    periodCenter: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: spacing.sm },
    periodLabel: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    currentMonthAction: {
      color: colors.primary,
      fontSize: 12,
      marginTop: spacing.xs,
      minHeight: 44,
      paddingVertical: spacing.md,
      textAlign: 'center',
    },

    // Custom range
    customRangeCard: { marginBottom: spacing.xxl },
    customRangeLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: spacing.xs },
    dateInput: {
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      color: colors.text,
      fontSize: 15,
      backgroundColor: colors.background,
      marginBottom: spacing.md,
    },
    applyButton: {
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    applyButtonText: { color: colors.textInverse, fontWeight: '700', fontSize: 14 },
    activeRangeText: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm, textAlign: 'center' },

    // Account filter
    filterSection: { marginBottom: spacing.xl },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
    accountPickerCard: { marginTop: spacing.sm, padding: 0, overflow: 'hidden' },
    accountOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    accountOptionSelected: { backgroundColor: colors.background },
    accountOptionText: { color: colors.text, fontSize: 14 },
    accountOptionCurrency: { color: colors.textMuted, fontSize: 12 },

    // Summary
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
    summaryCard: { flex: 1, maxWidth: '100%', padding: spacing.lg },
    summaryIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    summaryLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm },
    usdEquivalent: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: spacing.xs,
      fontStyle: 'italic',
    },

    // Money pair
    moneyPair: { gap: spacing.xs },
    moneyPrimary: { color: colors.text, fontSize: 16, fontWeight: '700' },
    moneySecondary: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
    positive: { color: colors.income },
    negative: { color: colors.expense },

    // Net card
    netCard: { marginBottom: spacing.xxxl },
    netHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    netLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
    netCaption: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },

    // Category sections
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
    sectionTitleSpacing: { marginTop: spacing.xxxl },
    categoryList: { gap: spacing.sm },
    categoryCard: { padding: spacing.lg },
    categoryIdentity: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    categoryIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    categoryName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
    categoryCurrencyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: spacing.sm },
    currencyCode: { color: colors.textMuted, fontSize: 12, fontWeight: '700', width: 32 },
    barTrack: {
      flex: 1,
      height: 7,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      overflow: 'hidden',
      marginHorizontal: spacing.sm,
    },
    bar: { height: '100%', borderRadius: radius.full },
    categoryAmount: {
      width: '100%',
      marginTop: spacing.xs,
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'right',
    },

    // Empty / loading / hint states
    emptyCard: { marginBottom: spacing.sm },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: spacing.sm },
    secondaryText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    hintText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
    retryButton: {
      minHeight: 44,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.primarySolid,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
    },
    retryText: { color: colors.textInverse, fontWeight: '700' },
  })
);
