import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getActivityForExport } from '../repositories/activityRepository';
import type { ActivityFilters } from '../types';
import { buildActivityCsv } from '../utils/activityCsv';
import { ValidationError } from '../utils/errors';

export type CsvExportResult =
  | { status: 'cancelled' }
  | { status: 'prepared'; fileName: string; rowCount: number };

// Called only by the user's confirmed Export action. It opens the system
// chooser; it never selects a recipient, sends data, or uploads automatically.
export async function exportActivityCsv(
  db: SQLiteDatabase,
  filters: ActivityFilters,
  options: { signal?: AbortSignal } = {}
): Promise<CsvExportResult> {
  const snapshot = { ...filters };
  if (options.signal?.aborted) return { status: 'cancelled' };
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new ValidationError('CSV file sharing is available in the iOS and Android app.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new ValidationError('File sharing is not available on this device.');
  }
  if (options.signal?.aborted) return { status: 'cancelled' };
  const items = await getActivityForExport(db, snapshot);
  if (options.signal?.aborted) return { status: 'cancelled' };
  if (items.length === 0) throw new ValidationError('No entries match these filters. There is nothing to export.');
  const csv = buildActivityCsv(items);
  const directory = new Directory(Paths.cache, 'dailyfinance-csv-exports');
  directory.create({ idempotent: true, intermediates: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `dailyfinance-${stamp}-${randomUUID()}.csv`;
  const file = new File(directory, fileName);
  file.create(); // Never overwrite a previous export.
  try {
    file.write(csv, { encoding: 'utf8' });
  } catch (error) {
    // Only this newly created partial file is eligible for removal.
    try { if (file.exists) file.delete(); } catch { /* The OS can clear the cache. */ }
    throw error;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv', UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Save or share PocketLedger CSV',
  });
  // Another app may still be reading this private cache copy. Do not delete it
  // immediately; the OS can reclaim it. No copy is placed in Documents here.
  // shareAsync does not distinguish save/share success from dismissal.
  return { status: 'prepared', fileName, rowCount: items.length };
}
