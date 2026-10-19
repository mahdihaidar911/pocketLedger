export function greetingForNow(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function getStartOfTodayIso(): string {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date.toISOString();
}

export function getStartOfWeekIso(): string {
  const date = new Date();

  // Monday = beginning of the week
  const currentDay = date.getDay();

  const daysSinceMonday =
    currentDay === 0
      ? 6
      : currentDay - 1;

  date.setDate(
    date.getDate() - daysSinceMonday
  );

  date.setHours(0, 0, 0, 0);

  return date.toISOString();
}

export function getStartOfMonthIso(): string {
  const date = new Date();

  date.setDate(1);

  date.setHours(0, 0, 0, 0);

  return date.toISOString();
}