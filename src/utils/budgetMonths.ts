import { ValidationError } from './errors';

export function currentBudgetMonth(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new ValidationError('Invalid month.');
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function budgetMonthPeriod(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ValidationError('Choose a valid month.');
  const [year, number] = month.split('-').map(Number);
  if (year < 1 || year > 9998) throw new ValidationError('Choose a valid month.');
  // Construct each boundary independently: month lengths and UTC offsets vary.
  const start = new Date(0);
  start.setFullYear(year, number - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(0);
  end.setFullYear(year, number, 1);
  end.setHours(0, 0, 0, 0);
  return {
    startIso: start.toISOString(), endIso: end.toISOString(),
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

export function shiftBudgetMonth(month: string, offset: number): string {
  budgetMonthPeriod(month);
  if (!Number.isSafeInteger(offset)) throw new ValidationError('Invalid month change.');
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, number - 1 + offset, 1);
  const next = currentBudgetMonth(date);
  budgetMonthPeriod(next);
  return next;
}
