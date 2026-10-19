import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getMonthlyBudgets } from '../repositories/budgetRepository';
import type { MonthlyBudget } from '../types/budget';
import { logUnexpectedError } from '../utils/errors';

export function useMonthlyBudgets(month: string) {
  const db = useSQLiteContext();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ month: string; loading: boolean; error: boolean; items: MonthlyBudget[] }>({
    month, loading: true, error: false, items: [],
  });
  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ month, loading: true, error: false, items: [] });
    getMonthlyBudgets(db, month).then((items) => {
      if (active) setState({ month, loading: false, error: false, items });
    }).catch((error) => {
      logUnexpectedError('Failed to load budgets:', error);
      if (active) setState({ month, loading: false, error: true, items: [] });
    });
    return () => { active = false; };
  }, [db, month, revision]));
  return { ...state, loading: state.loading || state.month !== month, retry: () => setRevision((value) => value + 1) };
}
