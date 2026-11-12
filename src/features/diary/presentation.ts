import type { DiaryEntry } from '../../types/glyphs-diary.js';
import { normalizeSearch } from '../symbols/search.js';

/** Calendar dates are deliberately formatted without parsing them as UTC. */
export function diaryDate(entry: Pick<DiaryEntry, 'observationDate' | 'createdAt'>): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.observationDate ?? '')) return entry.observationDate;
  const date = new Date(entry.createdAt);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function formatDiaryDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
export function sortDiaryEntries(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return [...new Map(entries.map(entry => [entry.id, entry])).values()].sort((a, b) =>
    diaryDate(b).localeCompare(diaryDate(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
export function createDiarySearchIndex(entries: readonly DiaryEntry[]) {
  const indexed = sortDiaryEntries(entries).map(entry => ({ entry, fields: [entry.title, entry.description, diaryDate(entry), formatDiaryDate(diaryDate(entry))].map(normalizeSearch) }));
  return (query: string): DiaryEntry[] => {
    const needle = normalizeSearch(query);
    return indexed.filter(({ fields }) => !needle || fields.some(field => field.includes(needle))).map(({ entry }) => entry);
  };
}
