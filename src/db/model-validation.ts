import type { LocalDate } from '../types/glyphs-diary.js';
export function requiredText(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Некорректное поле: ${label}.`);
  return value.trim();
}
export function optionalText(value: unknown, max = 20_000): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('Некорректный текст.');
  return value.trim();
}
export function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Некорректный UUID.');
}
export function localDate(date = new Date()): LocalDate {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validateLocalDate(value: unknown): LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Укажите дату наблюдения в формате YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Некорректная дата наблюдения.');
  return value;
}
export function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export function assertRevision(actual: string, expected?: string) {
  if (expected !== undefined && expected !== actual) throw new Error('Запись изменена в другом редакторе. Откройте её заново.');
}
