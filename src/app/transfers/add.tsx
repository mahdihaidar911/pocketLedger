import {
  useEffect,
  useMemo,
  useRef,
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
  useLocalSearchParams,
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
} from '../../repositories';

import {
  createTransfer,
} from '../../repositories/transferRepository';

import {
  createThemedStyles, useTheme,
  radius,
  spacing,
} from '../../theme';

import type {
  Account,
  ExchangeRate,
} from '../../types';

import {
  getCurrentExchangeRate,
} from '../../repositories/exchangeRateRepository';
import {
  convertLbpToUsdMinor,
  convertUsdMinorToLbp,
  formatMoney,
  parseAmountToMinor,
} from '../../utils';

export default function AddTransferScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db = useSQLiteContext();

  const params = useLocalSearchParams<{
  sourceAccountId?: string;
  destinationAccountId?: string;
}>();

  const [accounts, setAccounts] =
    useState<Account[]>([]);

  const [
    sourceAccountId,
    setSourceAccountId,
  ] =
    useState<string | null>(null);

  const [
    destinationAccountId,
    setDestinationAccountId,
  ] =
    useState<string | null>(null);

  const [amount, setAmount] =
    useState('');

  const [note, setNote] =
    useState('');

  const [saving, setSaving] =
    useState(false);
    const [
  exchangeRate,
  setExchangeRate,
] =
  useState<ExchangeRate | null>(
    null
  );

    const submissionLocked =
  useRef(false);


  useEffect(() => {
  async function loadAccounts() {
    try {
      const result =
        await getAccounts(db);

      setAccounts(result);

      const requestedSource =
        params.sourceAccountId;

      const requestedDestination =
        params.destinationAccountId;

      const sourceExists =
        requestedSource &&
        result.some(
          (account) =>
            account.id ===
            requestedSource
        );

      const destinationExists =
        requestedDestination &&
        result.some(
          (account) =>
            account.id ===
            requestedDestination
        );

      if (sourceExists) {
        setSourceAccountId(
          requestedSource
        );
      } else if (result.length > 0) {
        setSourceAccountId(
          result[0].id
        );
      }

      if (destinationExists) {
        setDestinationAccountId(
          requestedDestination
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
}, [
  db,
  params.sourceAccountId,
  params.destinationAccountId,
]);
  useEffect(() => {
  async function loadExchangeRate() {
    try {
      const result =
        await getCurrentExchangeRate(
          db
        );

      setExchangeRate(result);
    } catch (error) {
      console.error(
        'Failed to load exchange rate:',
        error
      );
    }
  }

  loadExchangeRate();
}, [db]);

  const sourceAccount =
    useMemo(
      () =>
        accounts.find(
          (account) =>
            account.id ===
            sourceAccountId
        ) ?? null,
      [accounts, sourceAccountId]
    );

    const destinationAccount =
  useMemo(
    () =>
      accounts.find(
        (account) =>
          account.id ===
          destinationAccountId
      ) ?? null,
    [
      accounts,
      destinationAccountId,
    ]
  );
  const amountMinorForPreview =
  useMemo(() => {
    if (!sourceAccount) {
      return null;
    }

    return parseAmountToMinor(
      amount,
      sourceAccount.currency
    );
  }, [
    amount,
    sourceAccount,
  ]);
const convertedPreview =
  useMemo(() => {
    if (
      !sourceAccount ||
      !destinationAccount ||
      amountMinorForPreview === null ||
      amountMinorForPreview <= 0
    ) {
      return null;
    }

    // No conversion needed
    if (
      sourceAccount.currency ===
      destinationAccount.currency
    ) {
      return {
        amountMinor:
          amountMinorForPreview,

        currency:
          destinationAccount.currency,

        rate: null,
      };
    }

    if (!exchangeRate) {
      return null;
    }

    if (
      sourceAccount.currency === 'USD' &&
      destinationAccount.currency === 'LBP'
    ) {
      return {
        amountMinor:
          convertUsdMinorToLbp(
            amountMinorForPreview,
            exchangeRate.lbpPerUsd
          ),

        currency: 'LBP' as const,

        rate:
          exchangeRate.lbpPerUsd,
      };
    }

    if (
      sourceAccount.currency === 'LBP' &&
      destinationAccount.currency === 'USD'
    ) {
      return {
        amountMinor:
          convertLbpToUsdMinor(
            amountMinorForPreview,
            exchangeRate.lbpPerUsd
          ),

        currency: 'USD' as const,

        rate:
          exchangeRate.lbpPerUsd,
      };
    }

    return null;
  }, [
    sourceAccount,
    destinationAccount,
    amountMinorForPreview,
    exchangeRate,
  ]);
  const availableDestinations =
  useMemo(() => {
    if (!sourceAccount) {
      return [];
    }

    return accounts.filter(
      (account) =>
        account.id !==
        sourceAccount.id
    );
  }, [
    accounts,
    sourceAccount,
  ]);

  useEffect(() => {
    if (
      !destinationAccountId ||
      !availableDestinations.some(
        (account) =>
          account.id ===
          destinationAccountId
      )
    ) {
      setDestinationAccountId(
        availableDestinations[0]
          ?.id ?? null
      );
    }
  }, [
    availableDestinations,
    destinationAccountId,
  ]);

  async function handleSave() {
    if (!sourceAccount) {
      Alert.alert(
        'Source account required'
      );

      return;
    }

    if (!destinationAccount) {
      Alert.alert(
        'Destination account required',
        `You need another ${sourceAccount.currency} account before making this transfer.`
      );

      return;
    }

    const amountMinor =
      parseAmountToMinor(
        amount,
        sourceAccount.currency
      );

    if (
      amountMinor === null ||
      amountMinor <= 0
    ) {
      Alert.alert(
        'Invalid amount',
        'Enter a valid transfer amount.'
      );

      return;
    }
if (submissionLocked.current) {
  return;
}

submissionLocked.current = true;
try {
  setSaving(true);

  const transfer =
  await createTransfer(
    db,
    {
      sourceAccountId:
        sourceAccount.id,

      destinationAccountId:
        destinationAccount.id,

      amountMinor,

      note:
        note.trim() || null,
    }
  );

  Alert.alert(
  'Transfer complete',
  transfer.sourceCurrency ===
    transfer.destinationCurrency
    ? `${formatMoney(
        transfer.sourceAmountMinor,
        transfer.sourceCurrency
      )} was moved from ${
        sourceAccount.name
      } to ${
        destinationAccount.name
      }.`
    : `${formatMoney(
        transfer.sourceAmountMinor,
        transfer.sourceCurrency
      )} was converted to ${formatMoney(
        transfer.destinationAmountMinor,
        transfer.destinationCurrency
      )} and transferred to ${
        destinationAccount.name
      }.`,
  [
    {
      text: 'Done',
      onPress: () =>
        router.replace('/'),
    },
  ],
  {
    cancelable: false,
  }
);
} catch (error) {
  submissionLocked.current = false;
  setSaving(false);

  console.error(
    'Transfer failed:',
    error
  );

  Alert.alert(
    'Unable to transfer',
    error instanceof Error
      ? error.message
      : 'Something went wrong.'
  );
}
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

        <Text
          style={styles.headerTitle}
        >
          Transfer
        </Text>

        <Pressable
          disabled={saving}
          onPress={handleSave}
        >
          <Text
            style={styles.saveText}
          >
            {saving
              ? 'Saving...'
              : 'Save'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.transferIcon}>
        <Ionicons
          name="swap-horizontal"
          size={30}
          color={colors.primary}
        />
      </View>

      <Text style={styles.label}>
        From
      </Text>

      <View style={styles.options}>
        {accounts.map((account) => {
          const selected =
            account.id ===
            sourceAccountId;

          return (
            <Pressable
              key={account.id}
              style={[
                styles.accountOption,
                selected &&
                  styles.selectedAccount,
              ]}
             onPress={() => {
  setSourceAccountId(
    account.id
  );

  setDestinationAccountId(
    null
  );

  setAmount('');
}}
            >
              <Text
                style={[
                  styles.accountName,
                  selected &&
                    styles.selectedText,
                ]}
              >
                {account.name}
              </Text>

              <Text
                style={[
                  styles.balance,
                  selected &&
                    styles.selectedSecondary,
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
        To
      </Text>

      {availableDestinations.length ===
      0 ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageTitle}>
            No compatible destination
          </Text>

          <Text style={styles.messageText}>
            Add another{' '}
            {sourceAccount?.currency ??
              ''}{' '}
            account first.
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
                styles.addAccountText
              }
            >
              Add Account
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.options}>
          {availableDestinations.map(
            (account) => {
              const selected =
                account.id ===
                destinationAccountId;

              return (
                <Pressable
                  key={account.id}
                  style={[
                    styles.accountOption,
                    selected &&
                      styles.selectedDestination,
                  ]}
                  onPress={() =>
                    setDestinationAccountId(
                      account.id
                    )
                  }
                >
                  <Text
                    style={[
                      styles.accountName,
                      selected &&
                        styles.selectedText,
                    ]}
                  >
                    {account.name}
                  </Text>

                  <Text
                    style={[
                      styles.balance,
                      selected &&
                        styles.selectedSecondary,
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
      )}

      <Text style={styles.label}>
        Amount
      </Text>

      <View style={styles.amountBox}>
        <Text
          style={styles.currencyPrefix}
        >
          {sourceAccount?.currency ===
          'USD'
            ? '$'
            : 'LBP'}
        </Text>

        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={
            sourceAccount?.currency ===
            'USD'
              ? '0.00'
              : '0'
          }
          placeholderTextColor={
            colors.textMuted
          }
          style={styles.amountInput}
        />
      </View>

      {sourceAccount && (
        <Text style={styles.available}>
          Available:{' '}
          {formatMoney(
            sourceAccount.balanceMinor,
            sourceAccount.currency
          )}
        </Text>
      )}
      {sourceAccount &&
  destinationAccount &&
  sourceAccount.currency !==
    destinationAccount.currency && (
    <View style={styles.conversionCard}>
      <View style={styles.conversionHeader}>
        <Ionicons
          name="swap-horizontal"
          size={18}
          color={colors.primary}
        />

        <Text
          style={styles.conversionTitle}
        >
          Currency Conversion
        </Text>
      </View>

      {!exchangeRate ? (
        <>
          <Text
            style={styles.conversionWarning}
          >
            No USD/LBP exchange rate is set.
          </Text>

          <Pressable
            style={styles.setRateButton}
            onPress={() =>
              router.push(
                '/settings/exchange-rate'
              )
            }
          >
            <Text
              style={styles.setRateText}
            >
              Set Exchange Rate
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.rateRow}>
            <Text
              style={styles.rateLabel}
            >
              Current rate
            </Text>

            <Text
              style={styles.rateValue}
            >
              1 USD ={' '}
              {new Intl.NumberFormat(
                'en-US'
              ).format(
                exchangeRate.lbpPerUsd
              )}{' '}
              LBP
            </Text>
          </View>

          {convertedPreview && (
            <View
              style={
                styles.previewSection
              }
            >
              <Text
                style={
                  styles.previewLabel
                }
              >
                Destination receives
              </Text>

              <Text
                style={
                  styles.previewAmount
                }
              >
                {formatMoney(
                  convertedPreview.amountMinor,
                  convertedPreview.currency
                )}
              </Text>
            </View>
          )}

          <Text
            style={styles.rateNotice}
          >
            The exact exchange rate used
            will be stored with this
            transfer.
          </Text>
        </>
      )}
    </View>
  )}

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
          styles.transferButton,
          saving &&
            styles.disabledButton,
        ]}
        disabled={saving}
        onPress={handleSave}
      >
        <Ionicons
          name="swap-horizontal"
          size={20}
          color={colors.textInverse}
        />

        <Text
          style={styles.transferButtonText}
        >
          {saving
            ? 'Transferring...'
            : 'Transfer Money'}
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
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },

  headerTitle: {
    flexShrink: 1, textAlign: 'center',
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },

  cancelText: {
    minHeight: 44, paddingVertical: spacing.md,
    color: colors.textSecondary,
    fontSize: 15,
  },

  saveText: {
    minHeight: 44, paddingVertical: spacing.md,
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },

  transferIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxxl,
  },

  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },

  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },

  accountOption: {
    minWidth: 135,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },

  selectedAccount: {
    backgroundColor: colors.primarySolid,
    borderColor: colors.primary,
  },

  selectedDestination: {
    backgroundColor: colors.primarySolid,
    borderColor: colors.primary,
  },

  selectedText: {
    color: colors.textInverse,
  },

  selectedSecondary: {
    color: colors.primarySelected,
  },

  accountName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },

  balance: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: spacing.xs,
  },

  amountBox: {
    paddingVertical: spacing.md,
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },

  currencyPrefix: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '700',
    marginRight: spacing.sm,
  },

  amountInput: {
    minWidth: 0,
    flex: 1,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },

  available: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },

  noteInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: spacing.xxxl,
  },

  transferButton: {
    paddingVertical: spacing.md,
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySolid,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  transferButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },

  disabledButton: {
    opacity: 0.6,
  },

  messageBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.xxl,
  },

  messageTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },

  messageText: {
    color: colors.textSecondary,
    fontSize: 13,
  },

  addAccountButton: {
    paddingVertical: spacing.md,
    minHeight: 44,
    backgroundColor: colors.primarySolid,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },

  addAccountText: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  conversionCard: {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.lg,
  backgroundColor: colors.surface,
  padding: spacing.lg,
  marginBottom: spacing.xxl,
},

conversionHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  marginBottom: spacing.lg,
},

conversionTitle: {
  color: colors.text,
  fontSize: 14,
  fontWeight: '700',
},

rateRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},

rateLabel: {
  color: colors.textSecondary,
  fontSize: 12,
},

rateValue: {
  color: colors.text,
  fontSize: 13,
  fontWeight: '700',
},

previewSection: {
  marginTop: spacing.lg,
  paddingTop: spacing.lg,
  borderTopWidth: 1,
  borderTopColor: colors.border,
},

previewLabel: {
  color: colors.textSecondary,
  fontSize: 12,
  marginBottom: spacing.sm,
},

previewAmount: {
  color: colors.primary,
  fontSize: 24,
  fontWeight: '700',
},

rateNotice: {
  color: colors.textMuted,
  fontSize: 11,
  lineHeight: 16,
  marginTop: spacing.lg,
},

conversionWarning: {
  color: colors.warning,
  fontSize: 13,
  lineHeight: 18,
},

setRateButton: {
    paddingVertical: spacing.md,
  minHeight: 44,
  borderRadius: radius.md,
  backgroundColor: colors.primarySolid,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: spacing.lg,
},

setRateText: {
  color: colors.textInverse,
  fontSize: 13,
  fontWeight: '700',
},
}))
