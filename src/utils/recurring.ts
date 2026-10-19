import type {
    RecurringFrequency,
} from '../types';

export function formatDateOnly(
  date: Date
): string {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getTodayDateOnly(): string {
  return formatDateOnly(
    new Date()
  );
}

export function formatRecurringFrequency(
  frequency: RecurringFrequency
): string {
  switch (frequency) {
    case 'daily':
      return 'Daily';

    case 'weekly':
      return 'Weekly';

    case 'monthly':
      return 'Monthly';

    case 'yearly':
      return 'Yearly';
  }
}

export function getNextRecurringDate(
  currentDate: string,
  frequency: RecurringFrequency,
  intervalCount = 1
): string {
  if (
    !Number.isSafeInteger(intervalCount) ||
    intervalCount <= 0
  ) {
    throw new Error(
      'Invalid recurrence interval.'
    );
  }

  const parts =
    currentDate.split('-');

  if (parts.length !== 3) {
    throw new Error(
      'Invalid recurring date.'
    );
  }

  const year =
    Number(parts[0]);

  const month =
    Number(parts[1]);

  const day =
    Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(
      'Invalid recurring date.'
    );
  }

  switch (frequency) {
    case 'daily':
      return addDays(
        year,
        month,
        day,
        intervalCount
      );

    case 'weekly':
      return addDays(
        year,
        month,
        day,
        intervalCount * 7
      );

    case 'monthly':
      return addMonths(
        year,
        month,
        day,
        intervalCount
      );

    case 'yearly':
      return addYears(
        year,
        month,
        day,
        intervalCount
      );
  }
}

function addDays(
  year: number,
  month: number,
  day: number,
  amount: number
): string {
  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
      amount
  );

  return formatUtcDateOnly(
    date
  );
}

function addMonths(
  year: number,
  month: number,
  day: number,
  amount: number
): string {
  const totalMonths =
    year * 12 +
    (month - 1) +
    amount;

  const targetYear =
    Math.floor(
      totalMonths / 12
    );

  const targetMonthIndex =
    totalMonths % 12;

  const lastDay =
    daysInMonth(
      targetYear,
      targetMonthIndex + 1
    );

  const targetDay =
    Math.min(
      day,
      lastDay
    );

  return `${targetYear}-${String(
    targetMonthIndex + 1
  ).padStart(2, '0')}-${String(
    targetDay
  ).padStart(2, '0')}`;
}

function addYears(
  year: number,
  month: number,
  day: number,
  amount: number
): string {
  const targetYear =
    year + amount;

  const lastDay =
    daysInMonth(
      targetYear,
      month
    );

  const targetDay =
    Math.min(
      day,
      lastDay
    );

  return `${targetYear}-${String(
    month
  ).padStart(2, '0')}-${String(
    targetDay
  ).padStart(2, '0')}`;
}

function daysInMonth(
  year: number,
  month: number
): number {
  return new Date(
    Date.UTC(
      year,
      month,
      0
    )
  ).getUTCDate();
}

function formatUtcDateOnly(
  date: Date
): string {
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}