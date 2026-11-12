import type { categories } from '../lib/categories';
export type CategoryId = (typeof categories)[number]['id'];
export interface CategoryMeaning { id: string; category: CategoryId; primary: string; secondary: string[]; isPrimaryCategory: boolean; order: number }
export type MeaningGroup = CategoryMeaning;
export interface SymbolCard { id: string; imageId: string | null; meanings: CategoryMeaning[]; tags: string[]; createdAt: number; updatedAt: number }
export interface MediaAsset { id: string; blob: Blob; mimeType: string; width: number; height: number; thumbnailBlob: Blob; createdAt: number }
// Object URLs belong only to the presentation snapshot, never to IndexedDB.
export interface GlyphySymbol extends SymbolCard { image: string; thumbnail: string; media?: MediaAsset }
export interface SymbolDraft { id?: string; imageId: string | null; meanings: CategoryMeaning[]; tags: string[]; expectedUpdatedAt?: number }

export type { UUID, IsoDateTime, LocalDate, GlyphPosition, GlyphReferenceValue, GlyphCell, GlyphRecord, GlyphInput, DiaryEntry, DiaryInput, UpdateOptions } from './glyphs-diary';
