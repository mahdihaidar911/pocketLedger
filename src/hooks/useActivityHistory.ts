import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getActivityPage } from '../repositories/activityRepository';
import type { ActivityCursor, ActivityFilters, ActivityListItem } from '../types';
import { getActivityDateRange, type ActivityDateFilter } from '../utils/activityDates';
import { logUnexpectedError } from '../utils/errors';

type ActiveQuery = {
  filters: ActivityFilters;
  cursor: ActivityCursor | null;
  busy: boolean;
  ready: boolean;
};

export function useActivityHistory(
  db: SQLiteDatabase,
  filters: ActivityFilters,
  dates: ActivityDateFilter
) {
  const [items, setItems] = useState<ActivityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeQuery = useRef<ActiveQuery | null>(null);

  useFocusEffect(useCallback(() => {
    const query: ActiveQuery = { filters, cursor: null, busy: true, ready: false };
    activeQuery.current = query;
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setError(null);
    setMoreError(false);
    async function load() {
      try {
        // Re-evaluate relative dates when the screen is focused or refreshed.
        query.filters = { ...filters, ...getActivityDateRange(dates) };
        const page = await getActivityPage(db, query.filters);
        if (activeQuery.current !== query) return;
        query.cursor = page.nextCursor;
        query.ready = true;
        setItems(page.items);
        setHasMore(page.nextCursor !== null);
      } catch (failure) {
        if (activeQuery.current !== query) return;
        logUnexpectedError('Failed to search activity:', failure);
        setError('Unable to load activity. Please try again.');
      } finally {
        if (activeQuery.current === query) {
          query.busy = false;
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      // Ignore late responses from an older search, page, or blurred screen.
      if (activeQuery.current === query) activeQuery.current = null;
    };
  }, [db, filters, dates, revision]));

  async function loadMore() {
    const query = activeQuery.current;
    if (!query || query.busy || !query.cursor) return;
    query.busy = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await getActivityPage(db, query.filters, { cursor: query.cursor });
      if (activeQuery.current !== query) return;
      query.cursor = page.nextCursor;
      setItems((previous) => [...previous, ...page.items]);
      setHasMore(page.nextCursor !== null);
    } catch (failure) {
      if (activeQuery.current !== query) return;
      logUnexpectedError('Failed to load more activity:', failure);
      // Keep current matches and cursor, so Retry requests the failed page.
      setMoreError(true);
    } finally {
      if (activeQuery.current === query) {
        query.busy = false;
        setLoadingMore(false);
      }
    }
  }

  return { items, loading, loadingMore, hasMore, error, moreError, loadMore,
    getExportFilters: (): ActivityFilters | null => {
      const query = activeQuery.current;
      return query?.ready && !query.busy ? { ...query.filters } : null;
    },
    refresh: () => setRevision((value) => value + 1) };
}
