import type { DiaryEntry, DiaryGroup } from '../../types/glyphs-diary.js';
import { sortDiaryEntries } from './presentation.js';
export function sortDiaryGroups(groups: readonly DiaryGroup[]) { return [...groups].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }
export function latestDiaryEntry(entries: readonly DiaryEntry[]) { return entries.reduce<DiaryEntry | undefined>((latest, entry) => !latest || entry.createdAt > latest.createdAt ? entry : latest, undefined); }
export function diaryGroupCover(group: DiaryGroup, entries: readonly DiaryEntry[]) {
  if (group.coverImageId) return group.coverImageId;
  const own = sortDiaryEntries(entries.filter(entry => entry.groupId === group.id && entry.imageIds.length));
  return own.find(entry => entry.id === group.coverEntryId)?.imageIds[0] ?? latestDiaryEntry(own)?.imageIds[0];
}
export function diaryGroupPath() { return '/diary/groups'; }
export function isDiaryGroupsRoute(path: string) { return path === diaryGroupPath(); }
/** Matches are already in chronological order from the shared diary index. */
export function diaryVisibleEntries(matches: DiaryEntry[], groups: DiaryGroup[], requested: string | null, _all: boolean, _hasQuery: boolean) {
  const active = groups.find(group => group.id === requested), unassigned = requested === 'unassigned';
  const filtered = matches.filter(entry => active ? entry.groupId === active.id : unassigned ? !entry.groupId : true);
  return filtered;
}
