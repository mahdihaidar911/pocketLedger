import {
    useEffect,
    useState,
} from 'react';

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
    Screen,
} from '../../components';

import {
    getAccounts,
} from '../../repositories/accountRepository';

import {
    getCategories,
} from '../../repositories/categoryRepository';

import {
    createRecurringPayment,
} from '../../repositories/recurringPaymentRepository';
import {
    syncRecurringReminders,
} from '../../services';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';

import type {
    Account,
    Category,
    RecurringFrequency,
    TransactionType,
} from '../../types';

import {
    formatMoney,
    getTodayDateOnly,
    parseAmountToMinor,
} from '../../utils';

export default function AddRecurringPaymentScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db =
    useSQLiteContext();

  const [type, setType] =
    useState<TransactionType>(
      'expense'
    );

  const [name, setName] =
    useState('');

  const [amount, setAmount] =
    useState('');

  const [
    accounts,
    setAccounts,
  ] =
    useState<Account[]>([]);

  const [
    accountId,
    setAccountId,
  ] =
    useState<string | null>(
      null
    );

  const [
    categories,
    setCategories,
  ] =
    useState<Category[]>([]);

  const [
    categoryId,
    setCategoryId,
  ] =
    useState<string | null>(
      null
    );

  const [
    frequency,
    setFrequency,
  ] =
    useState<RecurringFrequency>(
      'monthly'
    );

  const [
    startDate,
    setStartDate,
  ] =
    useState(
      getTodayDateOnly()
    );

  const [
    merchant,
    setMerchant,
  ] =
    useState('');

  const [note, setNote] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const result =
          await getAccounts(db);

        setAccounts(result);

        if (result.length > 0) {
          setAccountId(
            result[0].id
          );
        }
      } catch (error) {
        console.error(
          'Failed to load accounts:',
          error
        );
      }
    }

    loadAccounts();
  }, [db]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const result =
          await getCategories(
            db,
            type
          );

        setCategories(result);

        setCategoryId(
          result[0]?.id ?? null
        );
      } catch (error) {
        console.error(
          'Failed to load categories:',
          error
        );
      }
    }

    loadCategories();
  }, [db, type]);

  const selectedAccount =
    accounts.find(
      (account) =>
        account.id === accountId
    ) ?? null;

  async function handleSave() {
    const cleanName =
      name.trim();

    if (!cleanName) {
      Alert.alert(
        'Name required',
        'Enter a name for this recurring payment.'
      );

      return;
    }

    if (!selectedAccount) {
      Alert.alert(
        'Account required'
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
        'Enter a valid amount.'
      );

      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        startDate
      )
    ) {
      Alert.alert(
        'Invalid date',
        'Use YYYY-MM-DD.'
      );

      return;
    }

    try {
      setSaving(true);

      await createRecurringPayment(
        db,
        {
          name: cleanName,

          type,

          accountId:
            selectedAccount.id,

          categoryId,

          amountMinor,

          frequency,

          startDate,

          merchant:
            merchant.trim() || null,

          note:
            note.trim() || null,
        }
      );

      await syncRecurringReminders(db);

      Alert.alert(
        'Recurring payment created',
        `${cleanName} has been scheduled.`,
        [
          {
            text: 'Done',
            onPress: () =>
              router.back(),
          },
        ],
        {
          cancelable: false,
        }
      );
    } catch (error) {
      console.error(
        'Failed to create recurring payment:',
        error
      );

      Alert.alert(
        'Unable to create',
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );

      setSaving(false);
    }
  }

  return (
    <Screen
      scroll
      contentStyle={
        styles.content
      }
    >
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.back()
          }
        >
          <Text style={styles.cancel}>
            Cancel
          </Text>
        </Pressable>

        <Text
          style={styles.headerTitle}
        >
          New Recurring
        </Text>

        <Pressable
          disabled={saving}
          onPress={handleSave}
        >
          <Text style={styles.save}>
            {saving
              ? 'Saving...'
              : 'Save'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {(
          [
            'expense',
            'income',
          ] as TransactionType[]
        ).map((item) => {
          const selected =
            item === type;

          return (
            <Pressable
              key={item}
              style={[
                styles.typeButton,
                selected &&
                  styles.typeButtonSelected,
              ]}
              onPress={() => {
                setType(item);
                setAmount('');
              }}
            >
              <Text
                style={[
                  styles.typeText,
                  selected &&
                    styles.typeTextSelected,
                ]}
              >
                {item === 'expense'
                  ? 'Expense'
                  : 'Income'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        Name
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={name}
        onChangeText={setName}
        placeholder={
          type === 'expense'
            ? 'Netflix'
            : 'Monthly Salary'
        }
        placeholderTextColor={
          colors.textMuted
        }
        style={styles.input}
      />

      <Text style={styles.label}>
        Account
      </Text>

      <View style={styles.options}>
        {accounts.map(
          (account) => {
            const selected =
              account.id ===
              accountId;

            return (
              <Pressable
                key={account.id}
                style={[
                  styles.option,
                  selected &&
                    styles.optionSelected,
                ]}
                onPress={() => {
                  setAccountId(
                    account.id
                  );

                  setAmount('');
                }}
              >
                <Text
                  style={[
                    styles.optionTitle,
                    selected &&
                      styles.optionTextSelected,
                  ]}
                >
                  {account.name}
                </Text>

                <Text
                  style={[
                    styles.optionMeta,
                    selected &&
                      styles.optionMetaSelected,
                  ]}
                >
                  {formatMoney(
                    account.balanceMinor,
                    account.currency
                  )}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text style={styles.label}>
        Amount
      </Text>

      <View style={styles.amountBox}>
        <Text
          style={
            styles.currencyPrefix
          }
        >
          {selectedAccount
            ?.currency === 'USD'
            ? '$'
            : 'LBP'}
        </Text>

        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
          value={amount}
          onChangeText={setAmount}
          keyboardType={
            selectedAccount
              ?.currency === 'USD'
              ? 'decimal-pad'
              : 'number-pad'
          }
          placeholder={
            selectedAccount
              ?.currency === 'USD'
              ? '0.00'
              : '0'
          }
          placeholderTextColor={
            colors.textMuted
          }
          style={
            styles.amountInput
          }
        />
      </View>

      <Text style={styles.label}>
        Category
      </Text>

      <View style={styles.options}>
        {categories.map(
          (category) => {
            const selected =
              category.id ===
              categoryId;

            return (
              <Pressable
                key={category.id}
                style={[
                  styles.categoryOption,
                  selected &&
                    styles.categorySelected,
                ]}
                onPress={() =>
                  setCategoryId(
                    category.id
                  )
                }
              >
                <Ionicons
                  name={
                    (category.icon ??
                      'ellipse-outline') as keyof typeof Ionicons.glyphMap
                  }
                  size={16}
                  color={
                    selected
                      ? colors.textInverse
                      : colors.textSecondary
                  }
                />

                <Text
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
        Frequency
      </Text>

      <View style={styles.frequencyRow}>
        {(
          [
            'daily',
            'weekly',
            'monthly',
            'yearly',
          ] as RecurringFrequency[]
        ).map((item) => {
          const selected =
            frequency === item;

          return (
            <Pressable
              key={item}
              style={[
                styles.frequencyButton,
                selected &&
                  styles.frequencySelected,
              ]}
              onPress={() =>
                setFrequency(item)
              }
            >
              <Text
                style={[
                  styles.frequencyText,
                  selected &&
                    styles.frequencyTextSelected,
                ]}
              >
                {item
                  .charAt(0)
                  .toUpperCase() +
                  item.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        First due date
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={startDate}
        onChangeText={setStartDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={
          colors.textMuted
        }
        keyboardType="numbers-and-punctuation"
        style={styles.input}
      />

      <Text style={styles.label}>
        {type === 'expense'
          ? 'Merchant'
          : 'Source'}
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={merchant}
        onChangeText={setMerchant}
        placeholder={
          type === 'expense'
            ? 'Optional merchant'
            : 'Optional income source'
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
        style={styles.noteInput}
      />

      <Pressable
        style={[
          styles.createButton,
          saving &&
            styles.disabled,
        ]}
        disabled={saving}
        onPress={handleSave}
      >
        <Text
          style={
            styles.createButtonText
          }
        >
          {saving
            ? 'Creating...'
            : 'Create Recurring Payment'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const useStyles =
  createThemedStyles((colors) => StyleSheet.create({
    content: {
      paddingBottom: 60,
    },

    header: {
    flexWrap: 'wrap', gap: spacing.sm,
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom:
        spacing.xxl,
    },

    headerTitle: {
    flexShrink: 1, textAlign: 'center',
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },

    cancel: {
    minHeight: 44, paddingVertical: spacing.md,
      color:
        colors.textSecondary,
      fontSize: 15,
    },

    save: {
    minHeight: 44, paddingVertical: spacing.md,
      color: colors.primary,
      fontWeight: '700',
      fontSize: 15,
    },

    typeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom:
        spacing.xxxl,
    },

    typeButton: {
    paddingVertical: spacing.md,
      flex: 1,
      minHeight: 48,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    typeButtonSelected: {
      backgroundColor:
        colors.primarySolid,
      borderColor:
        colors.primary,
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
      marginBottom:
        spacing.sm,
    },

    input: {
    paddingVertical: spacing.md,
      minHeight: 56,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      color: colors.text,
      paddingHorizontal:
        spacing.lg,
      fontSize: 15,
      marginBottom:
        spacing.xxl,
    },

    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom:
        spacing.xxl,
    },

    option: {
      minWidth: 135,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      padding: spacing.md,
    },

    optionSelected: {
      backgroundColor:
        colors.primarySolid,
      borderColor:
        colors.primary,
    },

    optionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },

    optionMeta: {
      color:
        colors.textSecondary,
      fontSize: 10,
      marginTop:
        spacing.xs,
    },

    optionTextSelected: {
      color:
        colors.textInverse,
    },

    optionMetaSelected: {
      color: colors.primarySelected,
    },

    amountBox: {
    paddingVertical: spacing.md,
      minHeight: 70,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal:
        spacing.lg,
      marginBottom:
        spacing.xxl,
    },

    currencyPrefix: {
      color:
        colors.textSecondary,
      fontSize: 20,
      fontWeight: '700',
      marginRight:
        spacing.sm,
    },

    amountInput: {
    minWidth: 0,
      flex: 1,
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
    },

    categoryOption: {
    paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.surface,
      paddingHorizontal:
        spacing.md,
      minHeight: 44,
    },

    categorySelected: {
      backgroundColor:
        colors.primarySolid,
      borderColor:
        colors.primary,
    },

    categoryText: {
      color:
        colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },

    categoryTextSelected: {
      color:
        colors.textInverse,
    },

    frequencyRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom:
        spacing.xxl,
    },

    frequencyButton: {
    paddingVertical: spacing.md,
      flexGrow: 1,
      minWidth: '45%',
      minHeight: 44,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    frequencySelected: {
      backgroundColor:
        colors.primarySolid,
      borderColor:
        colors.primary,
    },

    frequencyText: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },

    frequencyTextSelected: {
      color:
        colors.textInverse,
    },

    noteInput: {
      minHeight: 95,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      color: colors.text,
      padding: spacing.lg,
      textAlignVertical: 'top',
      marginBottom:
        spacing.xxxl,
    },

    createButton: {
    paddingVertical: spacing.md,
      minHeight: 56,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.primarySolid,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    createButtonText: {
      color:
        colors.textInverse,
      fontWeight: '700',
      fontSize: 15,
    },

    disabled: {
      opacity: 0.6,
    },
  }));
