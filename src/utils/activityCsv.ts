import type { ActivityListItem, CurrencyCode } from '../types';

export const ACTIVITY_CSV_HEADERS = [
  'type', 'occurred_at_local', 'account', 'currency',
  'amount', 'account_change', 'category', 'merchant', 'note',
  'destination_account', 'destination_currency',
  'destination_amount', 'exchange_rate_lbp_per_usd', 'created_at_local', 'updated_at_local',
] as const;

function quoteCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Prefix formula-like free text so opening a report does not treat it as a
// formula. Some importers display the apostrophe. This is not a raw backup.
function textCell(value: string | null): string {
  const text = value ?? '';
  const firstContent = text.replace(/^[\s\u0000-\u001f]+/u, '');
  const guarded = /^[=+\-@＝＋－＠]/u.test(firstContent) || /^[\t\r\n]/u.test(text)
    ? `'${text}` : text;
  return quoteCell(guarded);
}

export function formatCsvAmount(amountMinor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Cannot export an invalid transaction amount.');
  }
  const digits = String(amountMinor);
  if (currency === 'LBP') return digits;
  if (currency !== 'USD') throw new Error('Cannot export an unsupported currency.');
  const padded = digits.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function exchangeRateCell(value: number | null): string {
  if (value === null) return '';
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Cannot export an invalid exchange rate.');
  return String(value);
}

function timestampCell(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Cannot export an invalid transaction date.');
  const pad = (part: number) => String(part).padStart(2, '0');
  // Format the instant in the phone's current time zone, including the offset
  // applicable on that date. Stored ISO timestamps stay unchanged.
  const day = `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return quoteCell(`${day} ${time}`);
}

function activityCsvRow(activity: ActivityListItem): string {
  const item = activity.data;
  const tail = [exchangeRateCell(item.exchangeRateLbpPerUsd), timestampCell(item.createdAt), timestampCell(item.updatedAt)];
  if (activity.kind === 'transfer') {
    const transfer = activity.data;
    const amount = formatCsvAmount(transfer.sourceAmountMinor, transfer.sourceCurrency);
    return [
      quoteCell('transfer'), timestampCell(transfer.occurredAt),
      textCell(transfer.sourceAccountName), quoteCell(transfer.sourceCurrency),
      amount, `-${amount}`, textCell(null), textCell(null), textCell(transfer.note),
      textCell(transfer.destinationAccountName), quoteCell(transfer.destinationCurrency),
      formatCsvAmount(transfer.destinationAmountMinor, transfer.destinationCurrency), ...tail,
    ].join(',');
  }
  const transaction = activity.data;
  const amount = formatCsvAmount(transaction.amountMinor, transaction.currency);
  return [
    quoteCell(transaction.type), timestampCell(transaction.occurredAt),
    textCell(transaction.accountName), quoteCell(transaction.currency),
    amount, transaction.type === 'expense' ? `-${amount}` : amount,
    textCell(transaction.categoryName ?? 'Uncategorized'), textCell(transaction.merchant), textCell(transaction.note),
    textCell(null), textCell(null), '', ...tail,
  ].join(',');
}

export function buildActivityCsv(items: readonly ActivityListItem[]): string {
  // UTF-8 BOM helps spreadsheet apps recognize Arabic and other Unicode text.
  // CRLF records plus quoted/escaped text preserve commas and multiline notes.
  return '\uFEFF' + [ACTIVITY_CSV_HEADERS.map(quoteCell).join(','), ...items.map(activityCsvRow)].join('\r\n') + '\r\n';
}
