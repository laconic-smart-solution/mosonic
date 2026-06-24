import type { CostEntryRecord } from '../repositories/interfaces/cost-entry.repository.interface';
import type { DailySpendRow } from './api-provider.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type SpendDateRange = {
  from: Date;
  to: Date;
};

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDateStart(value?: string): Date | null {
  const s = value?.trim();
  if (!s || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseIsoDateEnd(value?: string): Date | null {
  const s = value?.trim();
  if (!s || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(23, 59, 59, 999);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

export function spendRangeFromDays(days: number): SpendDateRange {
  const to = endOfToday();
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export function parseSpendDateRange(
  fromStr?: string,
  toStr?: string,
  fallbackDays = 180,
): SpendDateRange {
  const hasExplicit = Boolean(fromStr?.trim() || toStr?.trim());
  if (!hasExplicit) {
    return spendRangeFromDays(fallbackDays);
  }

  const to = parseIsoDateEnd(toStr) ?? endOfToday();
  const from =
    parseIsoDateStart(fromStr) ??
    (() => {
      const start = new Date(to);
      start.setDate(start.getDate() - fallbackDays);
      start.setHours(0, 0, 0, 0);
      return start;
    })();

  if (from.getTime() > to.getTime()) {
    return { from: parseIsoDateStart(toStr) ?? from, to: parseIsoDateEnd(fromStr) ?? to };
  }

  return { from, to };
}

export function spendDaysInRange(range: SpendDateRange): number {
  const fromDay = new Date(range.from);
  fromDay.setHours(0, 0, 0, 0);
  const toDay = new Date(range.to);
  toDay.setHours(0, 0, 0, 0);
  return (
    Math.floor((toDay.getTime() - fromDay.getTime()) / 86_400_000) + 1
  );
}

export function filterDailySpendInRange(
  rows: DailySpendRow[],
  range: SpendDateRange,
): DailySpendRow[] {
  const fromIso = toLocalIsoDate(range.from);
  const toIso = toLocalIsoDate(range.to);
  return rows.filter((row) => row.date >= fromIso && row.date <= toIso);
}

export function sumDailySpend(rows: DailySpendRow[]): number {
  return rows.reduce((acc, row) => acc + row.amountUsd, 0);
}

export function groupCostEntriesByDay(
  entries: CostEntryRecord[],
): DailySpendRow[] {
  const acc = new Map<string, number>();
  for (const entry of entries) {
    const raw = entry.createdAt;
    const day =
      raw instanceof Date && !Number.isNaN(raw.getTime())
        ? raw.toISOString().slice(0, 10)
        : 'unknown';
    if (day === 'unknown') continue;
    acc.set(day, (acc.get(day) ?? 0) + (entry.costUsd ?? 0));
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountUsd]) => ({ date, amountUsd }));
}

export function sumCostEntriesUsd(entries: CostEntryRecord[]): number {
  return entries.reduce((acc, entry) => acc + (entry.costUsd ?? 0), 0);
}
