import {
    router,
    useFocusEffect,
    useLocalSearchParams,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Screen } from '../../../components';
import {
    getAccountById,
    setAccountActive,
    updateAccountDetails,
} from '../../../repositories';
import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../../theme';
import type {
    Account,
    AccountType,
} from '../../../types';
import {
    formatMoney,
    parseAmountToMinor,
} from '../../../utils';

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

export default function EditAccountScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();

  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const [account, setAccount] =
    useState<Account | null>(null);

  const [name, setName] = useState('');

  const [type, setType] =
    useState<AccountType>('cash');

  const [lowBalanceThreshold, setLowBalanceThreshold] =
    useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!id) {
      return;
    }

    try {
      setLoading(true);

      const result = await getAccountById(
        db,
        id
      );

      setAccount(result);

      if (result) {
        setName(result.name);
        setType(result.type);

        if (
          result.lowBalanceThresholdMinor !== null
        ) {
          if (result.currency === 'USD') {
            setLowBalanceThreshold(
              (
                result.lowBalanceThresholdMinor /
                100
              ).toFixed(2)
            );
          } else {
            setLowBalanceThreshold(
              String(
                result.lowBalanceThresholdMinor
              )
            );
          }
        } else {
          setLowBalanceThreshold('');
        }
      }
    } catch (error) {
      console.error(
        'Failed to load account:',
        error
      );
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount])
  );

  async function handleSave() {
    if (!account) {
      return;
    }

    if (!name.trim()) {
      Alert.alert(
        'Account name required',
        'Enter a name for this account.'
      );

      return;
    }

    let thresholdMinor: number | null = null;

    if (lowBalanceThreshold.trim()) {
      thresholdMinor = parseAmountToMinor(
        lowBalanceThreshold,
        account.currency
      );

      if (thresholdMinor === null) {
        Alert.alert(
          'Invalid low balance alert',
          'Enter a valid amount.'
        );

        return;
      }
    }

    try {
      setSaving(true);

      await updateAccountDetails(db, {
        id: account.id,
        name,
        type,
        lowBalanceThresholdMinor:
          thresholdMinor,
      });

      router.back();
    } catch (error) {
      console.error(
        'Failed to update account:',
        error
      );

      Alert.alert(
        'Unable to save changes',
        'Something went wrong while updating this account.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeactivate() {
    if (!account) {
      return;
    }

    Alert.alert(
      'Deactivate account?',
      `${account.name} will be hidden from your active accounts. Its history will remain stored.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Deactivate',
          style: 'destructive',

          onPress: async () => {
            try {
              await setAccountActive(
                db,
                account.id,
                false
              );

              router.replace('/');
            } catch (error) {
              console.error(
                'Failed to deactivate account:',
                error
              );

              Alert.alert(
                'Unable to deactivate',
                'Something went wrong.'
              );
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      </Screen>
    );
  }

  if (!account) {
    return (
      <Screen>
        <Text style={styles.title}>
          Account not found
        </Text>
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
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>
            Cancel
          </Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          Edit Account
        </Text>

        <Pressable
          disabled={saving}
          onPress={handleSave}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>
        Account name
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholder="Account name"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>
        Account type
      </Text>

      <View style={styles.optionWrap}>
        {accountTypes.map((item) => {
          const selected =
            item.value === type;

          return (
            <Pressable
              key={item.value}
              style={[
                styles.option,
                selected &&
                  styles.optionSelected,
              ]}
              onPress={() =>
                setType(item.value)
              }
            >
              <Text
                style={[
                  styles.optionText,
                  selected &&
                    styles.optionTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        Currency
      </Text>

      <View style={styles.readOnlyField}>
        <Text style={styles.readOnlyValue}>
          {account.currency}
        </Text>

        <Text style={styles.lockedText}>
          Locked
        </Text>
      </View>

      <Text style={styles.helper}>
        Currency cannot be changed after an
        account is created.
      </Text>

      <Text style={styles.label}>
        Current balance
      </Text>

      <View style={styles.readOnlyField}>
        <Text style={styles.readOnlyValue}>
          {formatMoney(
            account.balanceMinor,
            account.currency
          )}
        </Text>

        <Text style={styles.lockedText}>
          Locked
        </Text>
      </View>

      <Text style={styles.helper}>
        Balance changes will be handled through
        transactions and adjustments.
      </Text>

      <Text style={styles.label}>
        Low balance alert
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={lowBalanceThreshold}
        onChangeText={setLowBalanceThreshold}
        keyboardType="decimal-pad"
        placeholder={
          account.currency === 'USD'
            ? 'Example: 100'
            : 'Example: 2000000'
        }
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <View style={styles.dangerSection}>
        <Text style={styles.dangerTitle}>
          Account status
        </Text>

        <Text style={styles.dangerDescription}>
          Deactivating an account hides it from
          your normal account list without
          deleting its financial history.
        </Text>

        <Pressable
          style={styles.deactivateButton}
          onPress={handleDeactivate}
        >
          <Text
            style={styles.deactivateButtonText}
          >
            Deactivate Account
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: {
    paddingBottom: 60,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    flexWrap: 'wrap', gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxxl,
  },

  headerTitle: {
    flexShrink: 1, textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  cancelText: {
    minHeight: 44, paddingVertical: spacing.md,
    color: colors.textSecondary,
    fontSize: 15,
  },

  saveText: {
    minHeight: 44, paddingVertical: spacing.md,
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
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

  readOnlyField: {
    minHeight: 54,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  readOnlyValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },

  lockedText: {
    color: colors.textMuted,
    fontSize: 12,
  },

  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },

  dangerSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xxl,
    marginTop: spacing.md,
  },

  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  dangerDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  deactivateButton: {
    paddingVertical: spacing.md,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deactivateButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
}));
