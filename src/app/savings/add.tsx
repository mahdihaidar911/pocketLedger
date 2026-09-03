import {
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
    createSavingsGoal,
} from '../../repositories/savingsGoalRepository';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../theme';

import type {
    CurrencyCode,
} from '../../types';

import {
    parseAmountToMinor,
} from '../../utils';

export default function AddSavingsGoalScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db =
    useSQLiteContext();

  const [name, setName] =
    useState('');

  const [target, setTarget] =
    useState('');

  const [
    currency,
    setCurrency,
  ] =
    useState<CurrencyCode>(
      'USD'
    );

  const [saving, setSaving] =
    useState(false);

  async function handleSave() {
    const cleanName =
      name.trim();

    if (!cleanName) {
      Alert.alert(
        'Goal name required',
        'Enter a name for your savings goal.'
      );

      return;
    }

    const targetAmountMinor =
      parseAmountToMinor(
        target,
        currency
      );

    if (
      targetAmountMinor === null ||
      targetAmountMinor <= 0
    ) {
      Alert.alert(
        'Invalid target',
        'Enter a valid target amount.'
      );

      return;
    }

    try {
      setSaving(true);

      await createSavingsGoal(
        db,
        {
          name: cleanName,

          targetAmountMinor,

          currency,

          icon:
            'flag-outline',
        }
      );

      Alert.alert(
        'Savings goal created',
        `${cleanName} is ready.`,
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
        'Failed to create savings goal:',
        error
      );

      Alert.alert(
        'Unable to create goal',
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
      <View
        style={styles.header}
      >
        <Pressable
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.cancelText
            }
          >
            Cancel
          </Text>
        </Pressable>

        <Text
          style={
            styles.headerTitle
          }
        >
          New Goal
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

      <View
        style={styles.icon}
      >
        <Ionicons
          name="flag-outline"
          size={30}
          color={colors.primary}
        />
      </View>

      <Text style={styles.label}>
        Goal name
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={name}
        onChangeText={setName}
        placeholder="Emergency Fund"
        placeholderTextColor={
          colors.textMuted
        }
        style={styles.input}
      />

      <Text style={styles.label}>
        Currency
      </Text>

      <View
        style={
          styles.currencyRow
        }
      >
        {(
          [
            'USD',
            'LBP',
          ] as CurrencyCode[]
        ).map((item) => {
          const selected =
            currency === item;

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
                setTarget('');
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
        })}
      </View>

      <Text style={styles.label}>
        Target amount
      </Text>

      <View
        style={styles.amountBox}
      >
        <Text
          style={
            styles.currencyPrefix
          }
        >
          {currency === 'USD'
            ? '$'
            : 'LBP'}
        </Text>

        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
          value={target}
          onChangeText={setTarget}
          keyboardType={
            currency === 'USD'
              ? 'decimal-pad'
              : 'number-pad'
          }
          placeholder={
            currency === 'USD'
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

      <View
        style={styles.infoCard}
      >
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={colors.primary}
        />

        <Text
          style={styles.infoText}
        >
          PocketLedger will create a
          dedicated savings account for
          this goal. Moving money into
          that account will update your
          progress automatically.
        </Text>
      </View>

      <Pressable
        style={[
          styles.createButton,
          saving &&
            styles.disabledButton,
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
            : 'Create Savings Goal'}
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

    headerTitle: {
    flexShrink: 1, textAlign: 'center',
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
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

    icon: {
      width: 64,
      height: 64,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.primarySoft,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom:
        spacing.xxxl,
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

    currencyRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom:
        spacing.xxl,
    },

    currencyButton: {
    paddingVertical: spacing.md,
      flex: 1,
      minHeight: 48,
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    currencyButtonSelected: {
      backgroundColor:
        colors.primarySolid,
      borderColor:
        colors.primary,
    },

    currencyText: {
      color:
        colors.textSecondary,
      fontWeight: '700',
    },

    currencyTextSelected: {
      color:
        colors.textInverse,
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

    infoCard: {
      flexDirection: 'row',
      gap: spacing.md,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      padding: spacing.lg,
      marginBottom:
        spacing.xxxl,
    },

    infoText: {
      flex: 1,
      color:
        colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
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
      fontSize: 15,
      fontWeight: '700',
    },

    disabledButton: {
      opacity: 0.6,
    },
  }));
