import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Screen } from '../../components';
import {
  getAllCategories,
  setCategoryActive,
} from '../../repositories/categoryRepository';
import { createThemedStyles, useTheme, radius, spacing } from '../../theme';
import type { Category, CategoryKind } from '../../types';
import { logUnexpectedError } from '../../utils/errors';

export default function CategoriesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadVersion = useRef(0);
  const mutationLocked = useRef(false);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      setLoading(true);
      setLoadFailed(false);
      const result = await getAllCategories(db, kind);
      if (loadVersion.current === version) setCategories(result);
    } catch (error) {
      logUnexpectedError('Failed to load categories:', error);
      if (loadVersion.current === version) setLoadFailed(true);
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  }, [db, kind]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load]));

  const active = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories]
  );
  const inactive = useMemo(
    () => categories.filter((category) => !category.isActive),
    [categories]
  );

  function confirmDeactivate(category: Category) {
    if (mutationLocked.current) return;
    Alert.alert(
      'Deactivate category?',
      `${category.name} will no longer appear when adding new ${category.kind} items. Existing history remains unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => void updateStatus(category, false),
        },
      ]
    );
  }

  async function updateStatus(category: Category, nextActive: boolean) {
    if (mutationLocked.current) return;
    mutationLocked.current = true;
    try {
      setWorkingId(category.id);
      await setCategoryActive(db, category.id, nextActive);
      await load();
    } catch (error) {
      logUnexpectedError('Failed to change category status:', error);
      Alert.alert(
        nextActive ? 'Unable to reactivate' : 'Unable to deactivate',
        error instanceof Error ? error.message : 'Something went wrong.'
      );
    } finally {
      mutationLocked.current = false;
      setWorkingId(null);
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={23} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Categories</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add category"
          disabled={workingId !== null}
          style={styles.headerButton}
          onPress={() =>
            router.push({ pathname: '/categories/add', params: { kind } })
          }
        >
          <Ionicons name="add" size={25} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.description}>
        Choose which categories appear when recording transactions and recurring items.
      </Text>

      <View style={styles.kindSelector}>
        {(['expense', 'income'] as CategoryKind[]).map((value) => (
          <Pressable
            key={value}
            disabled={workingId !== null}
            style={[styles.kindButton, kind === value && styles.kindButtonSelected]}
            onPress={() => setKind(value)}
          >
            <Text style={[styles.kindText, kind === value && styles.kindTextSelected]}>
              {value === 'expense' ? 'Expenses' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Active</Text>
      {loading ? (
        <Card><Text style={styles.secondaryText}>Loading categories...</Text></Card>
      ) : loadFailed ? (
        <Card>
          <Text style={styles.secondaryText}>Unable to load categories.</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()}>
            <Text style={styles.editText}>Try Again</Text>
          </Pressable>
        </Card>
      ) : (
        <View style={styles.list}>
          {active.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              working={workingId === category.id}
              disabled={workingId !== null}
              actionLabel="Deactivate"
              onAction={() => confirmDeactivate(category)}
            />
          ))}
        </View>
      )}

      {!loading && !loadFailed && inactive.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Inactive</Text>
          <View style={styles.list}>
            {inactive.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                working={workingId === category.id}
                disabled={workingId !== null}
                actionLabel="Reactivate"
                onAction={() => void updateStatus(category, true)}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function CategoryCard({ category, actionLabel, working, disabled, onAction }: {
  category: Category;
  actionLabel: string;
  working: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={[styles.categoryCard, !category.isActive && styles.inactiveCard]}>
      <View style={styles.categoryRow}>
        <View style={styles.categoryIdentity}>
          <View style={styles.iconBox}>
            <Ionicons
              name={(category.icon ?? 'ellipse-outline') as keyof typeof Ionicons.glyphMap}
              size={20}
              color={category.isActive ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.categoryText}>
            <Text style={[styles.categoryName, !category.isActive && styles.inactiveText]}>
              {category.name}
            </Text>
            <Text style={styles.categoryMeta}>
              {category.isDefault ? 'Default category' : 'Custom category'}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${category.name}`}
            disabled={disabled}
            onPress={() => router.push({
              pathname: '/categories/edit/[id]',
              params: { id: category.id },
            })}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} ${category.name}`}
            disabled={disabled}
            onPress={onAction}
          >
            <Text style={category.isActive ? styles.deactivateText : styles.reactivateText}>
              {working ? 'Working...' : actionLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { paddingBottom: 80 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.xxl,
  },
  kindSelector: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxxl },
  kindButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindButtonSelected: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  kindText: { color: colors.textSecondary, fontWeight: '700' },
  kindTextSelected: { color: colors.textInverse },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.md },
  secondaryText: { color: colors.textSecondary, fontSize: 13 },
  list: { gap: spacing.sm, marginBottom: spacing.xxxl },
  categoryCard: { padding: spacing.lg },
  inactiveCard: { opacity: 0.75 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  categoryText: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  actions: { alignItems: 'flex-end', gap: spacing.sm },
  editText: { color: colors.primary, fontSize: 12, fontWeight: '700', paddingVertical: spacing.sm },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  inactiveText: { color: colors.textSecondary },
  categoryMeta: { color: colors.textMuted, fontSize: 10, marginTop: spacing.xs },
  deactivateText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  reactivateText: { color: colors.income, fontSize: 11, fontWeight: '700' },
}));
