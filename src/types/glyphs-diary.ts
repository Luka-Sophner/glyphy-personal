import type { CategoryId } from './index';
export type UUID = string;
export type IsoDateTime = string;
export type LocalDate = string;
export const glyphPositions = ['topLeft', 'topCenter', 'topRight', 'middleLeft', 'center', 'middleRight', 'bottomLeft', 'bottomCenter', 'bottomRight'] as const;
export type GlyphPosition = typeof glyphPositions[number];
export const glyphPositionCategories = {
  topCenter: 'time', topRight: 'events', middleLeft: 'qualities', center: 'phenomena', middleRight: 'relations', bottomLeft: 'certainty', bottomCenter: 'experiences',
} as const satisfies Partial<Record<GlyphPosition, CategoryId>>;
export type GlyphReferenceValue =
  | { kind: 'local-number'; value: number }
  | { kind: 'local-reference'; value: number; targetGlyphId?: UUID };
export interface GlyphCell {
  position: GlyphPosition;
  symbolId: string | null; // Permanent dictionary IDs, including legacy/demo IDs.
  meaningId: string | null; // CategoryMeaning.id; secondary values share this group ID.
  meaningSnapshot: string;
  /** Immutable media reference retained independently of the source card. */
  imageIdSnapshot?: string | null;
  specialMode?: 'number' | 'symbol';
  referenceValue?: GlyphReferenceValue;
}
export interface GlyphRecord {
  id: UUID; primaryMeaning: string; synonyms: string[]; description: string;
  cells: GlyphCell[]; createdAt: IsoDateTime; updatedAt: IsoDateTime;
  additionalGlyphs?: GlyphPart[];
}
/** Ordered components of a phrase, saved atomically with its first glyph. */
export interface GlyphPart { id: UUID; primaryMeaning: string; synonyms: string[]; description: string; cells: GlyphCell[] }
export interface GlyphInput { primaryMeaning: string; synonyms?: string[]; description?: string; cells?: GlyphCell[]; additionalGlyphs?: GlyphPart[] }
export interface DiaryEntry {
  id: UUID; title: string; description: string; imageIds: string[];
  createdAt: IsoDateTime; updatedAt: IsoDateTime; observationDate: LocalDate;
  groupId?: UUID | null;
}
export interface DiaryInput { title: string; description?: string; imageIds: string[]; observationDate?: LocalDate; groupId?: UUID | null }
export interface DiaryGroup { id: UUID; title: string; coverEntryId: UUID | null; coverImageId?: string | null; order: number; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface DiaryGroupInput { title: string; coverEntryId?: UUID | null; coverImageId?: string | null }
export interface UpdateOptions { expectedUpdatedAt?: IsoDateTime }
export function emptyGlyphCells(): GlyphCell[] {
  return glyphPositions.map(position => ({ position, symbolId: null, meaningId: null, meaningSnapshot: '' }));
}
