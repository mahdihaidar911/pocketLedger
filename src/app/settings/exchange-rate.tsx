import {
    useCallback,
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
    getCurrentExchangeRate,
    setExchangeRate,
} from '../../repositories/exchangeRateRepository';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';

import type {
    ExchangeRate,
} from '../../types';

export default function ExchangeRateScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db =
    useSQLiteContext();

  const [
    currentRate,
    setCurrentRate,
  ] =
    useState<ExchangeRate | null>(
      null
    );

  const [value, setValue] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const loadRate =
    useCallback(async () => {
      try {
        const result =
          await getCurrentExchangeRate(
            db
          );

        setCurrentRate(result);

        if (result) {
          setValue(
            String(
              result.lbpPerUsd
            )
          );
        }
      } catch (error) {
        console.error(
          'Failed to load exchange rate:',
          error
        );
      }
    }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadRate();
    }, [loadRate])
  );

  async function handleSave() {
    const normalized =
      value
        .trim()
        .replace(/,/g, '');

    if (
      !/^\d+$/.test(
        normalized
      )
    ) {
      Alert.alert(
        'Invalid exchange rate',
        'Enter a whole-number LBP value.'
      );

      return;
    }

    const rate =
      Number(normalized);

    if (
      !Number.isSafeInteger(
        rate
      ) ||
      rate <= 0
    ) {
      Alert.alert(
        'Invalid exchange rate',
        'Enter a valid positive value.'
      );

      return;
    }

    try {
      setSaving(true);

      const result =
        await setExchangeRate(
          db,
          rate
        );

      setCurrentRate(result);

      Alert.alert(
        'Exchange rate updated',
        `1 USD = ${new Intl.NumberFormat(
          'en-US'
        ).format(rate)} LBP`
      );
    } catch (error) {
      console.error(
        'Failed to save exchange rate:',
        error
      );

      Alert.alert(
        'Unable to save rate',
        'Something went wrong.'
      );
    } finally {
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
      <View
        style={styles.header}
      >
        <Pressable
          style={
            styles.backButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.text}
          />
        </Pressable>

        <Text
          style={
            styles.headerTitle
          }
        >
          Exchange Rate
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <Card
        style={styles.rateCard}
      >
        <Text
          style={
            styles.rateLabel
          }
        >
          Current rate
        </Text>

        {currentRate ? (
          <>
            <Text
              style={
                styles.rateValue
              }
            >
              1 USD
            </Text>

            <Text
              style={
                styles.rateEquivalent
              }
            >
              {new Intl.NumberFormat(
                'en-US'
              ).format(
                currentRate.lbpPerUsd
              )}{' '}
              LBP
            </Text>
          </>
        ) : (
          <Text
            style={
              styles.notSetText
            }
          >
            No exchange rate set
          </Text>
        )}
      </Card>

      <Text style={styles.label}>
        1 USD equals
      </Text>

      <View
        style={styles.inputRow}
      >
        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
          value={value}
          onChangeText={setValue}
          placeholder="Example: 89500"
          placeholderTextColor={
            colors.textMuted
          }
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text
          style={
            styles.currencyLabel
          }
        >
          LBP
        </Text>
      </View>

      <Text
        style={styles.helper}
      >
        Updating this rate will
        affect new conversions and
        current balance estimates.
        Historical transactions will
        keep the exchange rate stored
        when they were created.
      </Text>

      <Pressable
        style={[
          styles.saveButton,
          saving &&
            styles.disabledButton,
        ]}
        disabled={saving}
        onPress={handleSave}
      >
        <Text
          style={
            styles.saveButtonText
          }
        >
          {saving
            ? 'Saving...'
            : 'Update Exchange Rate'}
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
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom:
        spacing.xxxl,
    },

    backButton: {
      width: 44,
      height: 44,
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

    headerTitle: {
    flexShrink: 1, textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },

    headerSpacer: {
      width: 42,
    },

    rateCard: {
      backgroundColor:
        colors.surfaceDark,
      borderColor:
        colors.surfaceDark,
      marginBottom:
        spacing.xxxl,
    },

    rateLabel: {
      color:
        colors.textMuted,
      fontSize: 13,
      marginBottom:
        spacing.xxl,
    },

    rateValue: {
      color:
        colors.textInverse,
      fontSize: 30,
      fontWeight: '700',
    },

    rateEquivalent: {
      color:
        colors.textMuted,
      fontSize: 17,
      marginTop: spacing.sm,
    },

    notSetText: {
      color:
        colors.textInverse,
      fontSize: 18,
      fontWeight: '600',
    },

    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom:
        spacing.sm,
    },

    inputRow: {
    paddingVertical: spacing.md,
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      paddingHorizontal:
        spacing.lg,
    },

    input: {
    minWidth: 0,
    paddingVertical: spacing.md,
      flex: 1,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },

    currencyLabel: {
      color:
        colors.textSecondary,
      fontWeight: '700',
    },

    helper: {
      color:
        colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing.sm,
      marginBottom:
        spacing.xxxl,
    },

    saveButton: {
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

    disabledButton: {
      opacity: 0.6,
    },

    saveButtonText: {
      color:
        colors.textInverse,
      fontSize: 15,
      fontWeight: '700',
    },
  }));
