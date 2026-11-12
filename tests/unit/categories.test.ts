import { describe, expect, it } from 'vitest';
import { categories } from '../../src/lib/categories';

describe('семантические категории из ТЗ', () => {
  it('сохраняет семь названий и порядок словаря Figma', () => {
    expect(categories.map(c => c.label)).toEqual([
      'Явления', 'Качества', 'События', 'Отношения', 'Переживания', 'Достоверность', 'Время',
    ]);
  });
});
