import { ValidationError } from './errors';

export type ActivityDatePreset = 'all' | 'today' | 'month' | 'custom';

export interface ActivityDateFilter {
  preset: ActivityDatePreset;
  fromDate?: string;
  toDate?: string;
}

function parseLocalDate(value: string | undefined): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('Enter both dates as YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (year < 1 || year > 9998 || date.getFullYear() !== year ||
      date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ValidationError('Enter a valid calendar date.');
  }
  return date;
}

// Use local calendar boundaries, not 24-hour durations: daylight-saving days
// may be shorter or longer. SQL still compares the app's UTC ISO timestamps.
export function getActivityDateRange(
  filter: ActivityDateFilter,
  now = new Date()
): { startIso?: string; endIso?: string } {
  if (filter.preset === 'all') return {};
  let start: Date;
  let end: Date;
  if (filter.preset === 'custom') {
    start = parseLocalDate(filter.fromDate);
    end = parseLocalDate(filter.toDate);
    if (start > end) throw new ValidationError('The end date must be on or after the start date.');
    end.setDate(end.getDate() + 1);
  } else {
    if (!Number.isFinite(now.getTime())) throw new ValidationError('The current date is invalid.');
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (filter.preset === 'month') start.setDate(1);
    else if (filter.preset !== 'today') throw new ValidationError('Choose a valid date filter.');
    end = new Date(start);
    if (filter.preset === 'month') end.setMonth(end.getMonth() + 1);
    else end.setDate(end.getDate() + 1);
  }
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
