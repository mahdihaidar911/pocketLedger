/**
 * reportExportService
 *
 * Generates PDF and Excel (.xlsx) exports of activity history.
 * Both formats use the same ActivityListItem data already loaded by
 * activityRepository, so no additional DB queries are needed here.
 *
 * PDF:  expo-print → printToFileAsync (HTML → native print engine) → share
 * XLSX: exceljs + buffer (pure JS, no native modules) → base64 → file → share
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { randomUUID } from 'expo-crypto';
import { File, Paths, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import ExcelJS from 'exceljs';
import { Buffer as NodeBuffer } from 'buffer';

import type { ActivityListItem, CurrencyCode } from '../types';
import { formatMoney } from '../utils/money';
import { ValidationError } from '../utils/errors';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAmount(minor: number, currency: CurrencyCode): string {
  return formatMoney(minor, currency);
}

/** Returns a signed display string: -$30.00 for expense, +$50.00 for income. */
function signedAmount(minor: number, currency: CurrencyCode, type: 'expense' | 'income' | 'transfer'): string {
  const abs = formatAmount(minor, currency);
  if (type === 'expense') return `-${abs}`;
  if (type === 'income') return `+${abs}`;
  return abs;
}

function labelForType(type: string): string {
  if (type === 'expense') return 'Expense';
  if (type === 'income') return 'Income';
  return 'Transfer';
}

function checkPlatform() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new ValidationError('Export is available in the iOS and Android app only.');
  }
}

async function checkSharing() {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ValidationError('File sharing is not available on this device.');
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

/**
 * Builds an HTML string representing a clean financial activity report.
 * expo-print renders this through the native print engine, producing
 * vector-quality selectable text.
 */
function buildReportHtml(items: readonly ActivityListItem[], title: string): string {
  const rows = items.map((activity) => {
    if (activity.kind === 'transfer') {
      const t = activity.data;
      return `
        <tr>
          <td>${formatTimestamp(t.occurredAt)}</td>
          <td><span class="badge transfer">Transfer</span></td>
          <td>${escHtml(t.sourceAccountName)} → ${escHtml(t.destinationAccountName)}</td>
          <td>—</td>
          <td>${formatAmount(t.sourceAmountMinor, t.sourceCurrency)} → ${formatAmount(t.destinationAmountMinor, t.destinationCurrency)}</td>
          <td>${escHtml(t.note ?? '')}</td>
        </tr>`;
    }
    const tx = activity.data;
    const typeClass = tx.type === 'expense' ? 'expense' : 'income';
    return `
      <tr>
        <td>${formatTimestamp(tx.occurredAt)}</td>
        <td><span class="badge ${typeClass}">${labelForType(tx.type)}</span></td>
        <td>${escHtml(tx.accountName)}</td>
        <td>${escHtml(tx.categoryName ?? 'Uncategorized')}</td>
        <td class="${typeClass}-amount">${signedAmount(tx.amountMinor, tx.currency, tx.type)}</td>
        <td>${escHtml(tx.merchant ?? tx.note ?? '')}</td>
      </tr>`;
  }).join('');

  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a2e; padding: 32px; }
  h1 { font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 10px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb; }
  td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 20px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .badge.expense { background: #fee2e2; color: #b91c1c; }
  .badge.income { background: #dcfce7; color: #15803d; }
  .badge.transfer { background: #e0e7ff; color: #3730a3; }
  .expense-amount { color: #dc2626; font-weight: 600; }
  .income-amount { color: #16a34a; font-weight: 600; }
  .footer { margin-top: 24px; color: #9ca3af; font-size: 9px; text-align: center; }
</style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p class="meta">Generated on ${generatedAt} · ${items.length} ${items.length === 1 ? 'entry' : 'entries'} · PocketLedger</p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Account</th>
        <th>Category</th>
        <th>Amount</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">This report contains private financial data. Keep it secure.</p>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ExportResult =
  | { status: 'cancelled' }
  | { status: 'prepared'; fileName: string; rowCount: number };

export async function exportActivityPdf(
  items: readonly ActivityListItem[],
  title = 'PocketLedger Activity Report'
): Promise<ExportResult> {
  checkPlatform();
  await checkSharing();

  if (items.length === 0) {
    throw new ValidationError('No entries match these filters. There is nothing to export.');
  }

  const html = buildReportHtml(items, title);

  // printToFileAsync renders HTML using the native print engine and returns
  // a local file:// URI. We then hand it to expo-sharing.
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  // Rename to a meaningful filename via copy since expo-print uses a temp name.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `dailyfinance-${stamp}.pdf`;
  const dir = new Directory(Paths.cache, 'dailyfinance-pdf-exports');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, fileName);

  // expo-file-system File.copy() — move the print temp file to our cache dir.
  const source = new File(uri);
  source.move(dest);

  await Sharing.shareAsync(dest.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Save or share PocketLedger PDF',
  });

  return { status: 'prepared', fileName, rowCount: items.length };
}

// ─── Excel ────────────────────────────────────────────────────────────────────

// Column definitions for the Excel sheet.
const XLSX_COLUMNS: ExcelJS.Column[] = [
  { header: 'Date',                 key: 'date',               width: 18 },
  { header: 'Type',                 key: 'type',               width: 10 },
  { header: 'Account',              key: 'account',            width: 20 },
  { header: 'Category',             key: 'category',           width: 22 },
  { header: 'Currency',             key: 'currency',           width: 9  },
  { header: 'Amount (display)',     key: 'amount',             width: 18 },
  { header: 'Amount (numeric)',     key: 'amountNumeric',      width: 16 },
  { header: 'Merchant / Note',      key: 'details',            width: 30 },
  { header: 'Destination Account',  key: 'destAccount',        width: 20 },
  { header: 'Dest. Currency',       key: 'destCurrency',       width: 13 },
  { header: 'Dest. Amount',         key: 'destAmount',         width: 16 },
  { header: 'Exchange Rate',        key: 'exchangeRate',       width: 14 },
] as unknown as ExcelJS.Column[];

/** Converts amount_minor to a plain decimal number for numeric cells. */
function toDecimal(minor: number, currency: CurrencyCode): number {
  return currency === 'USD' ? minor / 100 : minor;
}

function buildWorkbook(items: readonly ActivityListItem[], title: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PocketLedger';
  wb.created = new Date();

  const ws = wb.addWorksheet('Activity', {
    views: [{ state: 'frozen', ySplit: 1 }], // freeze header row
  });

  ws.columns = XLSX_COLUMNS;

  // Style the header row.
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE9EEF8' },
  };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.border = {
    bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
  };

  // Add a data row for each activity item.
  for (const activity of items) {
    if (activity.kind === 'transfer') {
      const t = activity.data;
      ws.addRow({
        date: formatTimestamp(t.occurredAt),
        type: 'Transfer',
        account: t.sourceAccountName,
        category: '',
        currency: t.sourceCurrency,
        amount: formatAmount(t.sourceAmountMinor, t.sourceCurrency),
        amountNumeric: toDecimal(t.sourceAmountMinor, t.sourceCurrency),
        details: t.note ?? '',
        destAccount: t.destinationAccountName,
        destCurrency: t.destinationCurrency,
        destAmount: toDecimal(t.destinationAmountMinor, t.destinationCurrency),
        exchangeRate: t.exchangeRateLbpPerUsd ?? '',
      });
      continue;
    }

    const tx = activity.data;
    const numeric = toDecimal(tx.amountMinor, tx.currency);
    ws.addRow({
      date: formatTimestamp(tx.occurredAt),
      type: labelForType(tx.type),
      account: tx.accountName,
      category: tx.categoryName ?? 'Uncategorized',
      currency: tx.currency,
      amount: signedAmount(tx.amountMinor, tx.currency, tx.type),
      // Expenses are negative numbers in the numeric column for easy SUM/pivot use.
      amountNumeric: tx.type === 'expense' ? -numeric : numeric,
      details: tx.merchant ?? tx.note ?? '',
      destAccount: '',
      destCurrency: '',
      destAmount: '',
      exchangeRate: tx.exchangeRateLbpPerUsd ?? '',
    });
  }

  // Auto-color type column: red for expense, green for income, blue for transfer.
  ws.eachRow((row, rowIdx) => {
    if (rowIdx === 1) return; // skip header
    const typeCell = row.getCell('type');
    const val = String(typeCell.value ?? '');
    if (val === 'Expense') typeCell.font = { color: { argb: 'FFDC2626' } };
    else if (val === 'Income') typeCell.font = { color: { argb: 'FF16A34A' } };
    else if (val === 'Transfer') typeCell.font = { color: { argb: 'FF2563EB' } };
  });

  // Summary sheet with totals.
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 20 },
  ] as unknown as ExcelJS.Column[];

  const summaryHeader = summary.getRow(1);
  summaryHeader.font = { bold: true };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF8' } };

  let usdExpenses = 0, lbpExpenses = 0, usdIncome = 0, lbpIncome = 0;
  for (const activity of items) {
    if (activity.kind === 'transfer') continue;
    const tx = activity.data;
    if (tx.type === 'expense') {
      if (tx.currency === 'USD') usdExpenses += tx.amountMinor;
      else lbpExpenses += tx.amountMinor;
    } else {
      if (tx.currency === 'USD') usdIncome += tx.amountMinor;
      else lbpIncome += tx.amountMinor;
    }
  }

  summary.addRows([
    { metric: 'Report title', value: title },
    { metric: 'Generated at', value: new Date().toISOString() },
    { metric: 'Total entries', value: items.length },
    { metric: 'Total expenses (USD)', value: formatAmount(usdExpenses, 'USD') },
    { metric: 'Total expenses (LBP)', value: formatAmount(lbpExpenses, 'LBP') },
    { metric: 'Total income (USD)', value: formatAmount(usdIncome, 'USD') },
    { metric: 'Total income (LBP)', value: formatAmount(lbpIncome, 'LBP') },
  ]);

  return wb;
}

export async function exportActivityXlsx(
  items: readonly ActivityListItem[],
  title = 'PocketLedger Activity'
): Promise<ExportResult> {
  checkPlatform();
  await checkSharing();

  if (items.length === 0) {
    throw new ValidationError('No entries match these filters. There is nothing to export.');
  }

  const wb = buildWorkbook(items, title);

  // ExcelJS can't write directly to a file path in React Native — use writeBuffer
  // then convert to base64 and write with expo-file-system.
  const buffer = await wb.xlsx.writeBuffer();
  const base64 = NodeBuffer.from(buffer as ArrayBuffer).toString('base64');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `dailyfinance-${stamp}-${randomUUID()}.xlsx`;
  const dir = new Directory(Paths.cache, 'dailyfinance-xlsx-exports');
  dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, fileName);
  file.create();

  try {
    file.write(base64, { encoding: 'base64' });
  } catch (err) {
    try { if (file.exists) file.delete(); } catch { /* let OS clean up */ }
    throw err;
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'com.microsoft.excel.xlsx',
    dialogTitle: 'Save or share PocketLedger Excel',
  });

  return { status: 'prepared', fileName, rowCount: items.length };
}
