import { PostingFrequency } from '../rule/schemas/rule.schema';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Compute the next scheduled run from rule campaign cadence. */
export function computeNextRunAt(
  postingFrequency: PostingFrequency,
  customSchedule: string | string[] | undefined,
  from: Date = new Date(),
): Date {
  const base = new Date(from);
  if (postingFrequency === PostingFrequency.Daily) {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
    return base;
  }
  if (postingFrequency === PostingFrequency.Weekly) {
    base.setDate(base.getDate() + 7);
    base.setHours(9, 0, 0, 0);
    return base;
  }
  const scheduleText = Array.isArray(customSchedule)
    ? customSchedule.join(',')
    : (customSchedule ?? '');
  const tokens = scheduleText
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const targetDays = tokens
    .map((t) => DAY_NAMES.indexOf(t.slice(0, 3)))
    .filter((d) => d >= 0);
  if (targetDays.length === 0) {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
    return base;
  }
  for (let i = 1; i <= 14; i += 1) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + i);
    candidate.setHours(9, 0, 0, 0);
    if (targetDays.includes(candidate.getDay())) {
      return candidate;
    }
  }
  base.setDate(base.getDate() + 7);
  return base;
}
