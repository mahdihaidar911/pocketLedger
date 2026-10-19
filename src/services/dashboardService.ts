import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccounts } from '../repositories/accountRepository';
import { getRecentActivity } from '../repositories/activityRepository';
import { getExpenseTotalsSince } from '../repositories/transactionRepository';
import { getCurrentExchangeRate } from '../repositories/exchangeRateRepository';
import { getUpcomingRecurringPayments } from '../repositories/recurringPaymentRepository';
import { getStartOfTodayIso, getStartOfWeekIso, getStartOfMonthIso, getNextRecurringDate, getTodayDateOnly } from '../utils';

// Publish a complete dashboard only after every existing repository read succeeds.
export async function loadDashboard(db: SQLiteDatabase) {
  const [accounts, recentTransactions, todayTotals, weekTotals, monthTotals, exchangeRate, upcomingRecurring] = await Promise.all([
    getAccounts(db),
    getRecentActivity(db, 5),
    getExpenseTotalsSince(db, getStartOfTodayIso()),
    getExpenseTotalsSince(db, getStartOfWeekIso()),
    getExpenseTotalsSince(db, getStartOfMonthIso()),
    getCurrentExchangeRate(db),
    getUpcomingRecurringPayments(db, getNextRecurringDate(getTodayDateOnly(), 'daily', 7), 4),
  ]);
  return { accounts, recentTransactions, todayTotals, weekTotals, monthTotals, exchangeRate, upcomingRecurring };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
