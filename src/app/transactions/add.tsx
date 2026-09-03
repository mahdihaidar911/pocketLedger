import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  router,
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
  createTransaction,
  getAccounts,
  getCategories,
} from '../../repositories';

import { checkAndFireLowBalanceAlert } from '../../services/notificationService';

import {
  createThemedStyles, useTheme,
  radius,
  spacing,
} from '../../theme';

import type {
  Account,
  Category,
  TransactionType,
} from '../../types';

import {
  formatMoney,
  parseAmountToMinor,
} from '../../utils';
import { logUnexpectedError } from '../../utils/errors';

export default function AddTransactionScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();

  const [type, setType] =
    useState<TransactionType>('expense');

  const [accounts, setAccounts] =
    useState<Account[]>([]);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [selectedAccountId, setSelectedAccountId] =
    useState<string | null>(null);

  const [
    selectedCategoryId,
    setSelectedCategoryId,
  ] = useState<string | null>(null);

  const [amount, setAmount] =
    useState('');

  const [merchant, setMerchant] =
    useState('');

  const [note, setNote] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);
  const saveLocked = useRef(false);

  const selectedAccount =
    useMemo(
      () =>
        accounts.find(
          (account) =>
            account.id ===
            selectedAccountId
        ) ?? null,
      [
        accounts,
        selectedAccountId,
      ]
    );

  useEffect(() => {
    async function loadAccounts() {
      try {
        const result =
          await getAccounts(db);

        setAccounts(result);

        if (
          result.length > 0 &&
          !selectedAccountId
        ) {
          setSelectedAccountId(
            result[0].id
          );
        }
      } catch (error) {
        console.error(
          'Failed to load accounts:',
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadAccounts();
  }, [
    db,
    selectedAccountId,
  ]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const result =
          await getCategories(
            db,
            type
          );

        setCategories(result);

        setSelectedCategoryId(
          result.length > 0
            ? result[0].id
            : null
        );
      } catch (error) {
        console.error(
          'Failed to load categories:',
          error
        );
      }
    }

    loadCategories();
  }, [
    db,
    type,
  ]);

  function handleTypeChange(
    nextType: TransactionType
  ) {
    if (nextType === type) {
      return;
    }

    setType(nextType);

    setSelectedCategoryId(null);

    setMerchant('');
  }

  async function handleSave() {
    if (saveLocked.current) return;
    if (!selectedAccount) {
      Alert.alert(
        'Account required',
        'Choose an account first.'
      );

      return;
    }

    if (!selectedCategoryId) {
      Alert.alert(
        'Category required',
        'Choose a category.'
      );

      return;
    }

    const amountMinor =
      parseAmountToMinor(
        amount,
        selectedAccount.currency
      );

    if (
      amountMinor === null ||
      amountMinor <= 0
    ) {
      Alert.alert(
        'Invalid amount',
        selectedAccount.currency ===
          'USD'
          ? 'Enter a valid amount greater than zero with up to two decimal places.'
          : 'Enter a valid LBP amount greater than zero.'
      );

      return;
    }

    saveLocked.current = true;
    try {
      setSaving(true);

      const created = await createTransaction(
        db,
        {
          type,

          accountId:
            selectedAccount.id,

          categoryId:
            selectedCategoryId,

          amountMinor,

          merchant:
            merchant.trim() || null,

          note:
            note.trim() || null,

          occurredAt:
            new Date().toISOString(),

          exchangeRateLbpPerUsd:
            null,
        }
      );

      // Check and fire a low-balance alert if needed (fire-and-forget).
      checkAndFireLowBalanceAlert(db, created.accountId).catch(() => undefined);

      router.back();
    } catch (error) {
      logUnexpectedError(
        'Failed to create transaction:',
        error
      );

      Alert.alert(
        'Unable to save transaction',
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );
    } finally {
      saveLocked.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Text style={styles.loadingText}>
          Loading...
        </Text>
      </Screen>
    );
  }

  if (accounts.length === 0) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable
            onPress={() =>
              router.back()
            }
          >
            <Text
              style={styles.cancelText}
            >
              Cancel
            </Text>
          </Pressable>

          <Text style={styles.headerTitle}>
            Add Transaction
          </Text>

          <View
            style={styles.headerPlaceholder}
          />
        </View>

        <Card>
          <Text style={styles.emptyTitle}>
            Add an account first
          </Text>

          <Text
            style={styles.emptyDescription}
          >
            Transactions need an account
            so PocketLedger knows which
            balance to update.
          </Text>

          <Pressable
            style={
              styles.createAccountButton
            }
            onPress={() =>
              router.push(
                '/accounts/add'
              )
            }
          >
            <Text
              style={
                styles.createAccountText
              }
            >
              Add Account
            </Text>
          </Pressable>
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
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={styles.cancelText}
          >
            Cancel
          </Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          Add Transaction
        </Text>

        <Pressable
          disabled={saving}
          onPress={handleSave}
        >
          <Text style={styles.saveText}>
            {saving
              ? 'Saving...'
              : 'Save'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.typeSelector}>
        <Pressable
          style={[
            styles.typeButton,
            type === 'expense' &&
              styles.expenseSelected,
          ]}
          onPress={() =>
            handleTypeChange(
              'expense'
            )
          }
        >
          <Ionicons
            name="arrow-up-outline"
            size={18}
            color={
              type === 'expense'
                ? colors.textInverse
                : colors.textSecondary
            }
          />

          <Text
            style={[
              styles.typeText,
              type === 'expense' &&
                styles.typeTextSelected,
            ]}
          >
            Expense
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.typeButton,
            type === 'income' &&
              styles.incomeSelected,
          ]}
          onPress={() =>
            handleTypeChange(
              'income'
            )
          }
        >
          <Ionicons
            name="arrow-down-outline"
            size={18}
            color={
              type === 'income'
                ? colors.textInverse
                : colors.textSecondary
            }
          />

          <Text
            style={[
              styles.typeText,
              type === 'income' &&
                styles.typeTextSelected,
            ]}
          >
            Income
          </Text>
        </Pressable>
        <Pressable
  style={styles.typeButton}
  onPress={() =>
    router.replace(
      '/transfers/add'
    )
  }
>
  <Ionicons
    name="swap-horizontal-outline"
    size={18}
    color={colors.textSecondary}
  />

  <Text style={styles.typeText}>
    Transfer
  </Text>
</Pressable>
      </View>

      <Text style={styles.label}>
        Amount
      </Text>

      <View style={styles.amountInput}>
        <Text style={styles.currencyPrefix}>
          {selectedAccount?.currency ===
          'USD'
            ? '$'
            : 'LBP'}
        </Text>

        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={
            selectedAccount?.currency ===
            'USD'
              ? '0.00'
              : '0'
          }
          placeholderTextColor={
            colors.textMuted
          }
          style={styles.amountTextInput}
        />
      </View>

      <Text style={styles.label}>
        Account
      </Text>

      <View style={styles.optionWrap}>
        {accounts.map((account) => {
          const selected =
            account.id ===
            selectedAccountId;

          return (
            <Pressable
              key={account.id}
              style={[
                styles.accountOption,
                selected &&
                  styles.accountOptionSelected,
              ]}
              onPress={() => {
                setSelectedAccountId(
                  account.id
                );

                setAmount('');
              }}
            >
              <Text
                style={[
                  styles.accountName,
                  selected &&
                    styles.selectedOptionText,
                ]}
              >
                {account.name}
              </Text>

              <Text
                style={[
                  styles.accountBalance,
                  selected &&
                    styles.selectedSecondaryText,
                ]}
              >
                {formatMoney(
                  account.balanceMinor,
                  account.currency
                )}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        Category
      </Text>

      <View style={styles.categoryGrid}>
        {categories.map(
          (category) => {
            const selected =
              category.id ===
              selectedCategoryId;

            const iconName =
              (category.icon ??
                'pricetag-outline') as keyof typeof Ionicons.glyphMap;

            return (
              <Pressable
                key={category.id}
                style={[
                  styles.categoryItem,
                  selected &&
                    styles.categoryItemSelected,
                ]}
                onPress={() =>
                  setSelectedCategoryId(
                    category.id
                  )
                }
              >
                <View
                  style={[
                    styles.categoryIcon,
                    selected &&
                      styles.categoryIconSelected,
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={19}
                    color={
                      selected
                        ? colors.textInverse
                        : colors.primary
                    }
                  />
                </View>

                <Text
                  numberOfLines={2}
                  style={[
                    styles.categoryText,
                    selected &&
                      styles.categoryTextSelected,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text style={styles.label}>
        {type === 'expense'
          ? 'Merchant / Store'
          : 'Source'}
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={merchant}
        onChangeText={setMerchant}
        placeholder={
          type === 'expense'
            ? 'Example: Total, Netflix...'
            : 'Example: Salary, Client...'
        }
        placeholderTextColor={
          colors.textMuted
        }
        style={styles.input}
      />

      <Text style={styles.label}>
        Note
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={note}
        onChangeText={setNote}
        placeholder="Optional note"
        placeholderTextColor={
          colors.textMuted
        }
        multiline
        textAlignVertical="top"
        style={[
          styles.input,
          styles.noteInput,
        ]}
      />

      <Text style={styles.label}>
        Date & Time
      </Text>

      <View style={styles.readOnlyDate}>
        <Ionicons
          name="calendar-outline"
          size={19}
          color={colors.textSecondary}
        />

        <View>
          <Text
            style={styles.datePrimary}
          >
            Today
          </Text>

          <Text
            style={styles.dateSecondary}
          >
            Current time
          </Text>
        </View>
      </View>

      <Text style={styles.dateHelper}>
        Custom transaction dates will be
        enabled shortly. New transactions
        currently use the current date and
        time.
      </Text>

      <Pressable
        style={[
          styles.bottomSaveButton,
          saving &&
            styles.disabledButton,
        ]}
        disabled={saving}
        onPress={handleSave}
      >
        <Text
          style={
            styles.bottomSaveText
          }
        >
          {saving
            ? 'Saving Transaction...'
            : type === 'expense'
              ? 'Add Expense'
              : 'Add Income'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const useStyles =
  createThemedStyles((colors) => StyleSheet.create({
    content: {
      paddingBottom: 70,
    },

    loadingText: {
      color: colors.textSecondary,
    },

    header: {
    flexWrap: 'wrap', gap: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom:
        spacing.xxxl,
    },

    headerTitle: {
    flexShrink: 1, textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },

    headerPlaceholder: {
      width: 50,
    },

    cancelText: {
    minHeight: 44, paddingVertical: spacing.md,
      color:
        colors.textSecondary,
      fontSize: 15,
    },

    saveText: {
    minHeight: 44, paddingVertical: spacing.md,
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },

    typeSelector: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor:
        colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom:
        spacing.xxxl,
    },

    typeButton: {
    paddingVertical: spacing.md,
      flex: 1,
      minHeight: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },

    expenseSelected: {
      backgroundColor:
        colors.expenseSolid,
    },

    incomeSelected: {
      backgroundColor:
        colors.incomeSolid,
    },

    typeText: {
      color:
        colors.textSecondary,
      fontWeight: '700',
    },

    typeTextSelected: {
      color:
        colors.textInverse,
    },

    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: spacing.sm,
    },

    amountInput: {
    paddingVertical: spacing.md,
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal:
        spacing.lg,
      marginBottom:
        spacing.xxl,
    },

    currencyPrefix: {
      fontSize: 20,
      fontWeight: '700',
      color:
        colors.textSecondary,
      marginRight: spacing.sm,
    },

    amountTextInput: {
    minWidth: 0,
      flex: 1,
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },

    optionWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom:
        spacing.xxl,
    },

    accountOption: {
      minWidth: 130,
      borderRadius: radius.md,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },

    accountOptionSelected: {
      backgroundColor:
        colors.primarySolid,
      borderColor:
        colors.primary,
    },

    accountName: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },

    accountBalance: {
      color:
        colors.textSecondary,
      fontSize: 11,
      marginTop: spacing.xs,
    },

    selectedOptionText: {
      color:
        colors.textInverse,
    },

    selectedSecondaryText: {
      color: colors.primarySelected,
    },

    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom:
        spacing.xxl,
    },

    categoryItem: {
      width: '31%',
      minHeight: 88,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor:
        colors.surface,
      padding: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },

    categoryItemSelected: {
      borderColor:
        colors.primary,
      backgroundColor:
        colors.primarySoft,
    },

    categoryIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.full,
      backgroundColor:
        colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },

    categoryIconSelected: {
      backgroundColor:
        colors.primarySolid,
    },

    categoryText: {
      color:
        colors.textSecondary,
      textAlign: 'center',
      fontSize: 11,
      lineHeight: 14,
    },

    categoryTextSelected: {
      color: colors.primary,
      fontWeight: '700',
    },

    input: {
    paddingVertical: spacing.md,
      minHeight: 54,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal:
        spacing.lg,
      fontSize: 15,
      color: colors.text,
      marginBottom:
        spacing.xxl,
    },

    noteInput: {
      minHeight: 100,
      paddingTop: spacing.lg,
    },

    readOnlyDate: {
      minHeight: 58,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal:
        spacing.lg,
    },

    datePrimary: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },

    dateSecondary: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: spacing.xs,
    },

    dateHelper: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: spacing.sm,
      marginBottom:
        spacing.xxxl,
    },

    bottomSaveButton: {
      minHeight: 56,
      borderRadius: radius.lg,
      backgroundColor:
        colors.primarySolid,
      alignItems: 'center',
      justifyContent: 'center',
    },

    disabledButton: {
      opacity: 0.6,
    },

    bottomSaveText: {
      color:
        colors.textInverse,
      fontWeight: '700',
      fontSize: 16,
    },

    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },

    emptyDescription: {
      fontSize: 13,
      lineHeight: 19,
      color:
        colors.textSecondary,
    },

    createAccountButton: {
    paddingVertical: spacing.md,
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor:
        colors.primarySolid,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
    },

    createAccountText: {
      color:
        colors.textInverse,
      fontWeight: '700',
    },
  }));
