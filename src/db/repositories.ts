import { repository } from './repository.js';
import { GlyphRepository } from './GlyphRepository.js';
import { DiaryRepository } from './DiaryRepository.js';
// All modules share the existing personal/demo database, not parallel databases.
export const glyphRepository = new GlyphRepository(repository.db);
export const diaryRepository = new DiaryRepository(repository.db);
export { repository as symbolRepository };
