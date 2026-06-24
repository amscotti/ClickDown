export function toDateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function localToday(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateOverdue(value: Date | string | null, now = new Date()): boolean {
  return value ? toDateOnly(value) < localToday(now) : false;
}

export function formatDateOnly(value: Date | string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${toDateOnly(value)}T00:00:00.000Z`).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC',
  });
}
