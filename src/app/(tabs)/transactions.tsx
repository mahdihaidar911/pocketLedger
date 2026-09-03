import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

import { ActivityRow, Card, Screen } from '../../components';
import { ActivityExportButton } from '../../components/ActivityExportButton';
import { useActivityHistory } from '../../hooks/useActivityHistory';
import { getAllAccounts } from '../../repositories';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import type { Account, ActivityFilters, ActivityTypeFilter } from '../../types';
import { getActivityDateRange, type ActivityDateFilter, type ActivityDatePreset } from '../../utils/activityDates';
import { logUnexpectedError } from '../../utils/errors';

const TYPE_OPTIONS: { value: ActivityTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfers' },
];
const DATE_OPTIONS: { value: ActivityDatePreset; label: string }[] = [
  { value: 'all', label: 'All time' }, { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month' }, { value: 'custom', label: 'Custom' },
];

export default function TransactionsScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [type, setType] = useState<ActivityTypeFilter>('all');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [accountRevision, setAccountRevision] = useState(0);
  const [dates, setDates] = useState<ActivityDateFilter>({ preset: 'all' });
  const [showCustom, setShowCustom] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setAccountsFailed(false);
    getAllAccounts(db).then((result) => {
      if (active) setAccounts(result);
    }).catch((error) => {
      logUnexpectedError('Failed to load activity account filters:', error);
      if (active) setAccountsFailed(true);
    });
    return () => { active = false; };
  }, [db, accountRevision]));

  const filters = useMemo<ActivityFilters>(() => ({ searchText: searchQuery, type, accountId }),
    [searchQuery, type, accountId]);
  const history = useActivityHistory(db, filters, dates);
  const hasFilters = Boolean(searchQuery || type !== 'all' || accountId || dates.preset !== 'all');
  const searchPending = searchText.trim() !== searchQuery;
  const datesPending = showCustom && (dates.preset !== 'custom' ||
    fromDate.trim() !== dates.fromDate || toDate.trim() !== dates.toDate);
  const dateSummary = dates.preset === 'custom'
    ? `${dates.fromDate} to ${dates.toDate} (inclusive)`
    : DATE_OPTIONS.find((option) => option.value === dates.preset)?.label;

  function clearFilters() {
    setSearchText('');
    setSearchQuery('');
    setType('all');
    setAccountId(null);
    setDates({ preset: 'all' });
    setShowCustom(false);
    setFromDate('');
    setToDate('');
  }

  function chooseDate(preset: ActivityDatePreset) {
    if (preset === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    setDates({ preset });
  }

  function applyCustomDates() {
    const next: ActivityDateFilter = { preset: 'custom', fromDate: fromDate.trim(), toDate: toDate.trim() };
    try {
      getActivityDateRange(next);
      setDates(next);
    } catch (error) {
      logUnexpectedError('Invalid activity dates:', error);
      Alert.alert('Check your dates', error instanceof Error ? error.message : 'Enter a valid date range.');
    }
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Transactions</Text>
          <Text style={styles.subtitle}>Expenses, income, and transfers</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add transaction" style={styles.addButton}
          onPress={() => router.push('/transactions/add')}>
          <Ionicons name="add" size={27} color={colors.textInverse} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} accessibilityLabel="Search activity" placeholder="Search merchant, note, category..."
          placeholderTextColor={colors.textMuted} style={styles.searchInput} value={searchText}
          onChangeText={setSearchText} autoCapitalize="none" autoCorrect={false} maxLength={200}
          returnKeyType="search" onSubmitEditing={() => setSearchQuery(searchText.trim())} />
        {searchText !== '' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}
            onPress={() => { setSearchText(''); setSearchQuery(''); }}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <Text style={styles.hint}>Searches all saved history, including account names.</Text>

      <Text style={styles.label}>Type</Text>
      <View style={styles.choices}>
        {TYPE_OPTIONS.map((option) => <FilterChip key={option.value} label={option.label}
          selected={type === option.value} onPress={() => setType(option.value)} />)}
      </View>

      <Text style={styles.label}>Account</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.accountChoices}>
        <FilterChip label="All accounts" selected={accountId === null} onPress={() => setAccountId(null)} />
        {accounts.map((account) => <FilterChip key={account.id}
          label={`${account.name} · ${account.currency}${account.isActive ? '' : ' (inactive)'}`}
          selected={accountId === account.id} onPress={() => setAccountId(account.id)} />)}
      </ScrollView>
      {accountsFailed && (
        <Pressable accessibilityRole="button" onPress={() => setAccountRevision((value) => value + 1)}>
          <Text style={styles.action}>Couldn’t load account choices. Tap to retry.</Text>
        </Pressable>
      )}

      <Text style={styles.label}>Date</Text>
      <View style={styles.choices}>
        {DATE_OPTIONS.map((option) => <FilterChip key={option.value} label={option.label}
          selected={option.value === 'custom' ? showCustom : !showCustom && dates.preset === option.value}
          onPress={() => chooseDate(option.value)} />)}
      </View>
      {showCustom && (
        <Card style={styles.customDates}>
          <Text style={styles.hint}>Enter local dates as YYYY-MM-DD, then apply.</Text>
          <Text style={styles.label}>From</Text>
          <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} accessibilityLabel="From date, YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
            style={styles.dateInput} value={fromDate} onChangeText={setFromDate} maxLength={10} autoCorrect={false} autoCapitalize="none" />
          <Text style={styles.label}>Through</Text>
          <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} accessibilityLabel="Through date, YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
            style={styles.dateInput} value={toDate} onChangeText={setToDate} maxLength={10} autoCorrect={false} autoCapitalize="none" />
          <Pressable accessibilityRole="button" style={styles.outlineButton} onPress={applyCustomDates}>
            <Text style={styles.action}>Apply Dates</Text>
          </Pressable>
        </Card>
      )}
      <Text style={styles.hint}>Dates in use: {dateSummary}. Uses your device’s timezone.</Text>

      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" onPress={() => { history.refresh(); setAccountRevision((value) => value + 1); }}>
          <Text style={styles.action}>Refresh</Text>
        </Pressable>
        {(hasFilters || searchText.length > 0 || showCustom) && (
          <Pressable accessibilityRole="button" onPress={clearFilters}><Text style={styles.action}>Clear Filters</Text></Pressable>
        )}
      </View>
      <ActivityExportButton
        disabled={history.loading || history.loadingMore || Boolean(history.error) ||
          history.items.length === 0 || searchPending || datesPending}
        getFilters={history.getExportFilters}
        selectionKey={JSON.stringify({ filters, dates })}
      />
      {datesPending && <Text style={styles.hint}>Apply your custom dates, or choose another date filter, before exporting.</Text>}
      {!history.loading && !history.error && (
        <Text accessibilityLiveRegion="polite" style={styles.resultCount}>
          {searchPending ? 'Updating search...' : `Showing ${history.items.length} ${history.items.length === 1 ? 'entry' : 'entries'}${history.hasMore ? ' · more available' : ''}`}
        </Text>
      )}
    </View>
  );

  return (
    <Screen bottomInset={false}>
      <FlatList data={history.items} keyExtractor={(item) => `${item.kind}-${item.data.id}`}
        renderItem={({ item }) => <ActivityRow activity={item} />}
        ItemSeparatorComponent={Separator} ListHeaderComponent={header}
        contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <Card>
            <Text style={styles.emptyTitle}>{history.loading || searchPending ? 'Loading activity...' : history.error ? 'Unable to load activity' : hasFilters ? 'No matching activity' : 'No activity yet'}</Text>
            <Text style={styles.hint}>{history.error ?? (history.loading || searchPending ? 'Checking your saved history.' : hasFilters ? 'Try another search or clear your filters.' : 'Add an expense or income to start tracking your money.')}</Text>
            {!history.loading && !searchPending && (
              <Pressable accessibilityRole="button" style={styles.outlineButton}
                onPress={history.error ? history.refresh : hasFilters ? clearFilters : () => router.push('/transactions/add')}>
                <Text style={styles.action}>{history.error ? 'Try Again' : hasFilters ? 'Clear Filters' : 'Add Transaction'}</Text>
              </Pressable>
            )}
          </Card>
        }
        ListFooterComponent={history.hasMore && !history.loading ? (
          <View style={styles.footer}>
            {history.moreError && <Text style={styles.hint}>Couldn’t load the next page. Your current results are still here.</Text>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: history.loadingMore }} disabled={history.loadingMore}
              style={[styles.outlineButton, history.loadingMore && styles.disabled]} onPress={history.loadMore}>
              <Text style={styles.action}>{history.loadingMore ? 'Loading...' : history.moreError ? 'Retry Load More' : 'Load More'}</Text>
            </Pressable>
          </View>
        ) : null}
      />
    </Screen>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[styles.chip, selected && styles.selectedChip]}>
      <Text style={[styles.chipText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function Separator() {
  const styles = useStyles(); return <View style={styles.separator} />; }

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingBottom: 120 },
  headerContent: { gap: spacing.sm, paddingBottom: spacing.lg },
  header: {
    flexWrap: 'wrap', gap: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  headerTitle: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  addButton: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.primarySolid, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.lg },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14, marginTop: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accountChoices: { gap: spacing.sm, paddingVertical: 2 },
  chip: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  selectedChip: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  selectedText: { color: colors.textInverse },
  customDates: { gap: spacing.sm, padding: spacing.lg },
  dateInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  action: { color: colors.primary, fontWeight: '700', fontSize: 14, paddingVertical: spacing.sm },
  resultCount: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.sm },
  outlineButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  separator: { height: spacing.sm },
  footer: { marginTop: spacing.lg },
  disabled: { opacity: 0.5 },
}));
