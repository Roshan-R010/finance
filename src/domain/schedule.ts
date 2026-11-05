export function manualSchedule(face: bigint, groups: { amount: bigint; count: number }[]): bigint[] {
  if (face <= 0n || !groups.length || groups.some(g => g.amount <= 0n || !Number.isSafeInteger(g.count) || g.count <= 0) || groups.reduce((n, g) => n + g.count, 0) > 10000) throw new Error('Invalid schedule');
  const rows = groups.flatMap(g => Array<bigint>(g.count).fill(g.amount));
  const difference = rows.reduce((a, b) => a + b, 0n) - face;
  if (difference !== 0n) throw new Error(`Schedule differs by ${difference} paise`);
  return rows;
}
export function scheduleByCount(face: bigint, count: number): bigint[] {
  if (face <= 0n || !Number.isSafeInteger(count) || count <= 0 || count > 10000 || BigInt(count) > face) throw new Error('Invalid schedule');
  const each = face / BigInt(count);
  return [...Array<bigint>(count - 1).fill(each), face - each * BigInt(count - 1)];
}
export function scheduleByAmount(face: bigint, amount: bigint): bigint[] {
  if (face <= 0n || amount <= 0n || (face + amount - 1n) / amount > 10000n) throw new Error('Invalid schedule');
  const full = Number(face / amount), remainder = face % amount;
  return [...Array<bigint>(full).fill(amount), ...(remainder ? [remainder] : [])];
}
/** Calendar arithmetic uses UTC solely as a date-only arithmetic representation. */
export function scheduleDates(start: string, count: number, intervalDays: number, weekday?: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isSafeInteger(count) || count < 1 || count > 10000 || !Number.isSafeInteger(intervalDays) || intervalDays < 1 || (weekday !== undefined && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || intervalDays !== 7))) throw new Error('Invalid date schedule');
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== start) throw new Error('Invalid date');
  if (weekday !== undefined) date.setUTCDate(date.getUTCDate() + (weekday - date.getUTCDay() + 7) % 7);
  return Array.from({ length: count }, (_, i) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + i * intervalDays); return d.toISOString().slice(0, 10); });
}
