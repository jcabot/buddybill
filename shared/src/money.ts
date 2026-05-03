// Currencies stored as numbers in major units (e.g. 12.34) but split math runs in
// integer minor units to avoid float drift. JPY has no minor units; everything
// else assumed 2 decimal places.

import type { Currency } from './constants.js';

export function minorPlaces(currency: Currency): number {
  return currency === 'JPY' ? 0 : 2;
}

export function toMinor(amount: number, currency: Currency): number {
  const factor = 10 ** minorPlaces(currency);
  return Math.round(amount * factor);
}

export function fromMinor(minor: number, currency: Currency): number {
  const factor = 10 ** minorPlaces(currency);
  return minor / factor;
}

/**
 * Equal split of an amount across n shares, in minor units. The remainder
 * (amount mod n) is distributed deterministically: the first `remainder`
 * recipients each get one extra unit. Sum is always exact.
 */
export function equalSplitMinor(totalMinor: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalMinor / n);
  const remainder = totalMinor - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function formatMoney(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: minorPlaces(currency),
      maximumFractionDigits: minorPlaces(currency),
    }).format(amount);
  } catch {
    return `${amount.toFixed(minorPlaces(currency))} ${currency}`;
  }
}
