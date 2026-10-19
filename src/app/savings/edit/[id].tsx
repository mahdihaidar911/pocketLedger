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
    useLocalSearchParams,
} from 'expo-router';

import {
    useSQLiteContext,
} from 'expo-sqlite';

import {
    getSavingsGoalById,
    updateSavingsGoal,
} from '../../../repositories/savingsGoalRepository';

import {
    Screen,
} from '../../../components';

import {
    createThemedStyles, useTheme,
    radius,
    spacing,
} from '../../../theme';

import type {
    SavingsGoalListItem,
} from '../../../types';

import {
    parseAmountToMinor,
} from '../../../utils';

export default function EditSavingsGoalScreen() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const db =
    useSQLiteContext();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [
    goal,
    setGoal,
  ] =
    useState<SavingsGoalListItem | null>(
      null
    );

  const [name, setName] =
    useState('');

  const [target, setTarget] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        if (!id) {
          return;
        }

        try {
          const result =
            await getSavingsGoalById(
              db,
              id
            );

          if (!result) {
            return;
          }

          setGoal(result);

          setName(result.name);

          setTarget(
            result.currency === 'USD'
              ? (
                  result.targetAmountMinor /
                  100
                ).toFixed(2)
              : String(
                  result.targetAmountMinor
                )
          );
        } catch (error) {
          console.error(
            'Failed to load goal:',
            error
          );
        }
      }

      load();
    }, [db, id])
  );

  async function handleSave() {
    if (!goal) {
      return;
    }

    const cleanName =
      name.trim();

    if (!cleanName) {
      Alert.alert(
        'Goal name required'
      );

      return;
    }

    const targetAmountMinor =
      parseAmountToMinor(
        target,
        goal.currency
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

      await updateSavingsGoal(
        db,
        {
          id: goal.id,

          name: cleanName,

          targetAmountMinor,

          targetDate:
            goal.targetDate,
        }
      );

      Alert.alert(
        'Goal updated',
        'Your savings goal has been updated.',
        [
          {
            text: 'Done',
            onPress: () =>
              router.back(),
          },
        ]
      );
    } catch (error) {
      console.error(
        'Failed to update goal:',
        error
      );

      Alert.alert(
        'Unable to update goal',
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );

      setSaving(false);
    }
  }

  if (!goal) {
    return (
      <Screen>
        <Text
          style={
            styles.loading
          }
        >
          Loading...
        </Text>
      </Screen>
    );
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
              styles.cancel
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
          Edit Goal
        </Text>

        <Pressable
          disabled={saving}
          onPress={handleSave}
        >
          <Text
            style={styles.save}
          >
            {saving
              ? 'Saving...'
              : 'Save'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>
        Goal name
      </Text>

      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor={
          colors.textMuted
        }
      />

      <Text style={styles.label}>
        Currency
      </Text>

      <View
        style={
          styles.lockedField
        }
      >
        <Text
          style={
            styles.lockedValue
          }
        >
          {goal.currency}
        </Text>

        <Text
          style={
            styles.lockedHint
          }
        >
          Currency cannot be changed
        </Text>
      </View>

      <Text style={styles.label}>
        Target amount
      </Text>

      <View
        style={styles.amountBox}
      >
        <Text
          style={
            styles.prefix
          }
        >
          {goal.currency === 'USD'
            ? '$'
            : 'LBP'}
        </Text>

        <TextInput keyboardAppearance={scheme} selectionColor={colors.primary} placeholderTextColor={colors.textMuted}
          value={target}
          onChangeText={setTarget}
          keyboardType={
            goal.currency === 'USD'
              ? 'decimal-pad'
              : 'number-pad'
          }
          style={
            styles.amountInput
          }
        />
      </View>

      <Pressable
        style={[
          styles.updateButton,

          saving &&
            styles.disabled,
        ]}
        disabled={saving}
        onPress={handleSave}
      >
        <Text
          style={
            styles.updateButtonText
          }
        >
          {saving
            ? 'Saving...'
            : 'Save Changes'}
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

    loading: {
      color:
        colors.textSecondary,
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

    cancel: {
    minHeight: 44, paddingVertical: spacing.md,
      color:
        colors.textSecondary,
      fontSize: 15,
    },

    save: {
    minHeight: 44, paddingVertical: spacing.md,
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
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

    lockedField: {
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
      padding: spacing.lg,
      marginBottom:
        spacing.xxl,
    },

    lockedValue: {
      color: colors.text,
      fontWeight: '700',
    },

    lockedHint: {
      color:
        colors.textMuted,
      fontSize: 11,
      marginTop:
        spacing.xs,
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
        spacing.xxxl,
    },

    prefix: {
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

    updateButton: {
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

    updateButtonText: {
      color:
        colors.textInverse,
      fontSize: 15,
      fontWeight: '700',
    },

    disabled: {
      opacity: 0.6,
    },
  }));
