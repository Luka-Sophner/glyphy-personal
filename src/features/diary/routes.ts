export interface DiaryRoute { entryId: string; editor: boolean; photoIndex?: number }
export const diaryPath = (id: string) => `/diary/${encodeURIComponent(id)}`;
export const diaryPhotoPath = (id: string, index: number) => `${diaryPath(id)}/photos/${index}`;
export function getDiaryRoute(path: string): DiaryRoute | null {
  if (path === '/diary/groups') return null;
  const match = /^\/diary\/([^/]+)(?:\/(edit)|\/photos\/(\d+))?$/.exec(path);
  if (!match) return null;
  try {
    const entryId = decodeURIComponent(match[1]);
    if (!entryId || entryId.includes('/')) return null;
    const photoIndex = match[3] === undefined ? undefined : Number(match[3]);
    if (photoIndex !== undefined && (!Number.isSafeInteger(photoIndex) || photoIndex < 0 || photoIndex >= 50)) return null;
    return { entryId, editor: !!match[2], ...(photoIndex === undefined ? {} : { photoIndex }) };
  } catch { return null; }
}
