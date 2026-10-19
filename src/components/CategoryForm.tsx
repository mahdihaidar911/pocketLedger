import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from './Screen';
import { createThemedStyles, useTheme, radius, spacing } from '../theme';
import type { CategoryKind, CreateCategoryInput } from '../types';
import { logUnexpectedError } from '../utils/errors';

const expenseIcons = [
  'restaurant-outline', 'cart-outline', 'home-outline', 'car-outline',
  'airplane-outline', 'heart-outline', 'game-controller-outline', 'gift-outline',
];
const incomeIcons = [
  'cash-outline', 'briefcase-outline', 'laptop-outline', 'business-outline',
  'trending-up-outline', 'gift-outline', 'wallet-outline', 'star-outline',
];

type CategoryFormProps = {
  initialValues: CreateCategoryInput;
  editing?: boolean;
  onSubmit: (input: CreateCategoryInput) => Promise<void>;
  onCancel: () => void;
};

export function CategoryForm({ initialValues, editing = false, onSubmit, onCancel }: CategoryFormProps) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const [kind, setKind] = useState(initialValues.kind);
  const [name, setName] = useState(initialValues.name);
  const [icon, setIcon] = useState<string | null>(initialValues.icon ?? null);
  const [saving, setSaving] = useState(false);
  const submissionLocked = useRef(false);
  const baseIcons = kind === 'expense' ? expenseIcons : incomeIcons;
  // Keep older/default icons selectable even when they are outside the curated palette.
  const icons: (string | null)[] = [
    null,
    ...baseIcons,
    ...(initialValues.icon && !baseIcons.includes(initialValues.icon) ? [initialValues.icon] : []),
  ];

  function changeKind(nextKind: CategoryKind) {
    if (editing || submissionLocked.current || kind === nextKind) return;
    setKind(nextKind);
    setIcon(nextKind === 'income' ? incomeIcons[0] : expenseIcons[0]);
  }

  async function handleSave() {
    if (submissionLocked.current) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this category.');
      return;
    }

    submissionLocked.current = true;
    setSaving(true);
    try {
      await onSubmit({ name, kind, icon });
      // The caller navigates back on success. Stay locked until this form unmounts.
    } catch (error) {
      logUnexpectedError('Failed to save category:', error);
      Alert.alert(
        'Unable to save category',
        error instanceof Error ? error.message : 'Something went wrong.'
      );
      submissionLocked.current = false;
      setSaving(false);
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel}>
          <Text style={[styles.cancel, saving && styles.disabled]}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? 'Edit Category' : 'New Category'}</Text>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void handleSave()}>
          <Text style={[styles.save, saving && styles.disabled]}>{saving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Type</Text>
      {editing ? (
        <View style={styles.typeSummary}>
          <Text style={styles.typeTitle}>{kind === 'expense' ? 'Expense' : 'Income'}</Text>
          <Text style={styles.helper}>Type stays fixed to protect existing transactions.</Text>
        </View>
      ) : (
        <View style={styles.kindSelector}>
          {(['expense', 'income'] as CategoryKind[]).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === value, disabled: saving }}
              disabled={saving}
              style={[styles.kindButton, kind === value && styles.selected]}
              onPress={() => changeKind(value)}
            >
              <Text style={[styles.kindText, kind === value && styles.selectedText]}>
                {value === 'expense' ? 'Expense' : 'Income'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>Name</Text>
      <TextInput keyboardAppearance={scheme} selectionColor={colors.primary}
        accessibilityLabel="Category name"
        value={name}
        onChangeText={setName}
        editable={!saving}
        placeholder={kind === 'expense' ? 'Example: Pets' : 'Example: Investments'}
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        style={styles.input}
      />

      <Text style={styles.label}>Icon</Text>
      <View style={styles.iconGrid}>
        {icons.map((value) => (
          <Pressable
            key={value ?? 'none'}
            accessibilityRole="button"
            accessibilityLabel={value ? `${value.replace(/-outline$/, '').replace(/-/g, ' ')} icon` : 'No icon'}
            accessibilityState={{ selected: icon === value, disabled: saving }}
            disabled={saving}
            style={[styles.iconButton, icon === value && styles.selected]}
            onPress={() => setIcon(value)}
          >
            <Ionicons
              name={(value && value in Ionicons.glyphMap ? value : 'ellipse-outline') as keyof typeof Ionicons.glyphMap}
              size={24}
              color={icon === value ? colors.textInverse : colors.textSecondary}
            />
          </Pressable>
        ))}
      </View>

      {editing && (
        <Text style={styles.historyNote}>
          The new name and icon will also appear in past transactions and reports. Amounts and balances will not change.
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        style={[styles.submitButton, saving && styles.disabled]}
        disabled={saving}
        onPress={() => void handleSave()}
      >
        <Text style={styles.submitText}>
          {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Category'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingBottom: 60 },
  header: {
    flexWrap: 'wrap', gap: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxxl },
  headerTitle: {
    flexShrink: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '700' },
  cancel: {
    minHeight: 44, paddingVertical: spacing.md, color: colors.textSecondary, fontSize: 15 },
  save: {
    minHeight: 44, paddingVertical: spacing.md, color: colors.primary, fontSize: 15, fontWeight: '700' },
  label: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: spacing.sm },
  kindSelector: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl },
  kindButton: {
    flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  kindText: { color: colors.textSecondary, fontWeight: '700' },
  typeSummary: { marginBottom: spacing.xxl },
  typeTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  helper: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  input: {
    paddingVertical: spacing.md,
    minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.lg,
    fontSize: 15, marginBottom: spacing.xxl,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xxl },
  iconButton: {
    width: 58, height: 58, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  selectedText: { color: colors.textInverse },
  historyNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: spacing.xxl },
  submitButton: {
    minHeight: 54, borderRadius: radius.md, backgroundColor: colors.primarySolid,
    alignItems: 'center', justifyContent: 'center',
  },
  submitText: { color: colors.textInverse, fontWeight: '700' },
  disabled: { opacity: 0.55 },
}));
