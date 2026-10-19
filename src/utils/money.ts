import type { CurrencyCode } from '../types';

export function parseAmountToMinor(
  value: string,
  currency: CurrencyCode
): number | null {
  const normalized = value.trim().replace(/,/g, '');

  if (!normalized) {
    return null;
  }

  if (currency === 'LBP') {
    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const amount = Number(normalized);

    return Number.isSafeInteger(amount) ? amount : null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const [wholePart, decimalPart = ''] = normalized.split('.');

  const whole = Number(wholePart);

  if (!Number.isSafeInteger(whole)) {
    return null;
  }

  const cents = Number(decimalPart.padEnd(2, '0'));

  const result = whole * 100 + cents;

  return Number.isSafeInteger(result) ? result : null;
}

export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode
): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(amountMinor)} LBP`;
}
export function convertLbpToUsdMinor(
  lbpMinor: number,
  lbpPerUsd: number
): number {
  if (
    lbpPerUsd <= 0
  ) {
    throw new Error(
      'Invalid exchange rate.'
    );
  }

  return Math.round(
    (lbpMinor / lbpPerUsd) * 100
  );
}

export function convertUsdMinorToLbp(
  usdMinor: number,
  lbpPerUsd: number
): number {
  if (
    lbpPerUsd <= 0
  ) {
    throw new Error(
      'Invalid exchange rate.'
    );
  }

  return Math.round(
    (usdMinor / 100) *
      lbpPerUsd
  );
}