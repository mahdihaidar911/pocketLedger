import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Screen } from '../../components';
import { createAccount } from '../../repositories';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import type {
    AccountType,
    CurrencyCode,
} from '../../types';
import { parseAmountToMinor } from '../../utils';

const accountTypes: {
  label: string;
  value: AccountType;
}[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Whish', value: 'whish' },
  { label: 'Bank', value: 'bank' },
  { label: 'Savings', value: 'savings' },
  { label: 'Other', value: 'other' },
];

export default function AddAccountScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();

  const [name, setName] = useState('');
  const [type, setType] =
    useState<AccountType>('cash');

  const [currency, setCurrency] =
    useState<CurrencyCode>('USD');

  const [openingBalance, setOpeningBalance] =
    useState('');

  const [lowBalanceThreshold, setLowBalanceThreshold] =
    useState('');

  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert(
        'Account name required',
        'Enter a name for this account.'
      );

      return;
    }

    const balanceMinor =
      parseAmountToMinor(openingBalance || '0', currency);

    if (balanceMinor === null) {
      Alert.alert(
        'Invalid balance',
        currency === 'USD'
          ? 'Enter a valid amount with up to two decimal places.'
          : 'Enter a valid LBP amount without decimals.'
      );

      return;
    }

    let thresholdMinor: number | null = null;

    if (lowBalanceThreshold.trim()) {
      thresholdMinor = parseAmountToMinor(
        lowBalanceThreshold,
        currency
      );

      if (thresholdMinor === null) {
        Alert.alert(
          'Invalid alert amount',
          'Enter a valid low-balance amount.'
        );

        return;
      }
    }

    try {
      setIsSaving(true);

      await createAccount(db, {
        name,
        type,
        currency,
        openingBalanceMinor: balanceMinor,
        lowBalanceThresholdMinor: thresholdMinor,
      });

      router.back();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Unable to save account',
        'Something went wrong while saving your account.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
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

        <Text style={styles.title}>Add Account</Text>

        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.label}>Account name</Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={name}
        onChangeText={setName}
        placeholder="Example: Cash USD"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Account type</Text>

      <View style={styles.optionWrap}>
        {accountTypes.map((item) => {
          const selected = item.value === type;

          return (
            <Pressable
              key={item.value}
              style={[
                styles.option,
                selected && styles.optionSelected,
              ]}
              onPress={() => setType(item.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  selected && styles.optionTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Currency</Text>

      <View style={styles.currencyRow}>
        {(['USD', 'LBP'] as CurrencyCode[]).map(
          (item) => {
            const selected = currency === item;

            return (
              <Pressable
                key={item}
                style={[
                  styles.currencyButton,
                  selected &&
                    styles.currencyButtonSelected,
                ]}
                onPress={() => {
                  setCurrency(item);
                  setOpeningBalance('');
                  setLowBalanceThreshold('');
                }}
              >
                <Text
                  style={[
                    styles.currencyText,
                    selected &&
                      styles.currencyTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text style={styles.label}>Opening balance</Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={openingBalance}
        onChangeText={setOpeningBalance}
        placeholder={
          currency === 'USD'
            ? '0.00'
            : '0'
        }
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        style={styles.input}
      />

      <Text style={styles.label}>
        Low balance alert
      </Text>

      <Text style={styles.optional}>
        Optional
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={lowBalanceThreshold}
        onChangeText={setLowBalanceThreshold}
        placeholder={
          currency === 'USD'
            ? 'Example: 100'
            : 'Example: 2000000'
        }
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        style={styles.input}
      />

      <Pressable
        style={[
          styles.saveButton,
          isSaving && styles.saveButtonDisabled,
        ]}
        disabled={isSaving}
        onPress={handleSave}
      >
        <Text style={styles.saveButtonText}>
          {isSaving ? 'Saving...' : 'Save Account'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: {
    paddingBottom: 60,
  },

  header: {
    flexWrap: 'wrap', gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxxl,
  },

  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  headerSpacer: {
    width: 42,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  optional: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -spacing.xl,
    marginBottom: spacing.sm,
    textAlign: 'right',
  },

  input: {
    paddingVertical: spacing.md,
    minHeight: 54,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.xxl,
  },

  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },

  option: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  optionSelected: {
    backgroundColor: colors.primarySolid,
    borderColor: colors.primary,
  },

  optionText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },

  optionTextSelected: {
    color: colors.textInverse,
  },

  currencyRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },

  currencyButton: {
    paddingVertical: spacing.md,
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  currencyButtonSelected: {
    backgroundColor: colors.primarySolid,
    borderColor: colors.primary,
  },

  currencyText: {
    fontWeight: '700',
    color: colors.textSecondary,
  },

  currencyTextSelected: {
    color: colors.textInverse,
  },

  saveButton: {
    paddingVertical: spacing.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySolid,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
}));
