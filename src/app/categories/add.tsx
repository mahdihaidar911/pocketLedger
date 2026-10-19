import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { CategoryForm } from '../../components/CategoryForm';
import { createCategory } from '../../repositories/categoryRepository';

export default function AddCategoryScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === 'income' ? 'income' : 'expense';

  return (
    <CategoryForm
      initialValues={{
        name: '',
        kind,
        icon: kind === 'income' ? 'cash-outline' : 'restaurant-outline',
      }}
      onCancel={() => router.back()}
      onSubmit={async (input) => {
        await createCategory(db, input);
        router.back();
      }}
    />
  );
}
