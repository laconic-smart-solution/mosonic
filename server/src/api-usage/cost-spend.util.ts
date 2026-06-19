import type { CostEntryRecord } from '../repositories/interfaces/cost-entry.repository.interface';
import type { DailySpendRow } from './api-provider.types';

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

export function spendRangeFromDays(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}
