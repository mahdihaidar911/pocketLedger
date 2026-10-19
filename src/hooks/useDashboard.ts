import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { loadDashboard, type DashboardData } from '../services/dashboardService';
import { logUnexpectedError } from '../utils/errors';

export function useDashboard() {
  const db = useSQLiteContext();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: boolean; data: DashboardData | null }>({
    loading: true, error: false, data: null,
  });
  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ loading: true, error: false, data: null });
    loadDashboard(db).then((data) => {
      if (active) setState({ loading: false, error: false, data });
    }).catch((error) => {
      if (!active) return;
      logUnexpectedError('Failed to load dashboard:', error);
      setState({ loading: false, error: true, data: null });
    });
    // A previous focus/retry must not replace newer data or an unmounted screen.
    return () => { active = false; };
  }, [db, revision]));
  return { ...state, retry: () => setRevision((value) => value + 1) };
}
