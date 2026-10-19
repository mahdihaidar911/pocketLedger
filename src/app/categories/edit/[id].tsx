import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Screen } from '../../../components';
import { CategoryForm } from '../../../components/CategoryForm';
import { getCategoryById, updateCategory } from '../../../repositories/categoryRepository';
import { createThemedStyles, spacing } from '../../../theme';
import type { Category } from '../../../types';
import { logUnexpectedError } from '../../../utils/errors';

export default function EditCategoryScreen() {
  const styles = useStyles();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setCategory(null);
    async function load() {
      try {
        const result = id ? await getCategoryById(db, id) : null;
        if (active) setCategory(result);
      } catch (error) {
        logUnexpectedError('Failed to load category:', error);
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [db, id, retry]);

  if (loading || !category) {
    return (
      <Screen>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.action}>Back to categories</Text>
        </Pressable>
        <Card>
          <Text style={styles.message}>
            {loading ? 'Loading category...' : failed ? 'Unable to load category.' : 'Category not found.'}
          </Text>
          {!loading && failed && (
            <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
              <Text style={styles.action}>Try Again</Text>
            </Pressable>
          )}
        </Card>
      </Screen>
    );
  }

  return (
    <CategoryForm
      key={category.id}
      editing
      initialValues={{ name: category.name, kind: category.kind, icon: category.icon }}
      onCancel={() => router.back()}
      onSubmit={async (input) => {
        await updateCategory(db, category.id, { name: input.name, icon: input.icon ?? null });
        router.back();
      }}
    />
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  action: { color: colors.primary, fontWeight: '700', paddingVertical: spacing.lg },
  message: { color: colors.textSecondary, fontSize: 14 },
}));
