export function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function subHoursLocal(d: Date, hours: number): Date {
  return new Date(d.getTime() - hours * 3_600_000);
}

export function formatHourLocal(d: Date): string {
  return String(d.getHours()).padStart(2, '0');
}
