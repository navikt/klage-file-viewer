import { describe, expect, it } from 'bun:test';
import { isHighlightableFile } from '@/files/pdf/highlights/highlightable-file';
import type { FileEntry, FileVariant } from '@/types';

const file = (variants: FileEntry['variants'], highlightsId?: string): FileEntry => ({
  title: 'File',
  url: '/file',
  variants,
  highlightsId,
});

const variant = (filtype: FileVariant['filtype'], format: FileVariant['format']): FileVariant => ({
  filtype,
  format,
  hasAccess: true,
  skjerming: null,
});

describe('isHighlightableFile', () => {
  it('requires a highlights ID and a PDF variant', () => {
    expect(isHighlightableFile(file('PDF', '/a'))).toBe(true);
    expect(isHighlightableFile(file('PNG', '/a'))).toBe(false);
    expect(isHighlightableFile(file('PDF'))).toBe(false);
    expect(isHighlightableFile(file('XLSX', '/a'))).toBe(false);
    expect(isHighlightableFile(file('JSON', '/a'))).toBe(false);
  });

  it('checks every variant', () => {
    expect(isHighlightableFile(file(variant('XLSX', 'ARKIV'), '/a'))).toBe(false);
    expect(isHighlightableFile(file([variant('XLSX', 'ARKIV'), variant('PDF', 'SLADDET')], '/a'))).toBe(true);
  });
});
