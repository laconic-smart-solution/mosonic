/**
 * Parse `YYYY-MM-DD` query params as inclusive UTC day bounds for dashboard filters.
 * Plain `new Date("2026-05-13")` is midnight UTC and excludes most of that calendar day.
 */
export function parseDashboardFromIsoDay(raw?: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseDashboardToIsoDay(raw?: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
