import { describe, expect, it } from 'bun:test';
import { resolveVariantData } from '@/file-header/resolve-variant';
import type { FileVariant, FileVariants, VariantFormat } from '@/types';

const noop = () => undefined;

const resolve = (variants: FileVariants, selectedFormat: VariantFormat) =>
  resolveVariantData(variants, selectedFormat, noop);

const variant = (format: VariantFormat, hasAccess = true): FileVariant => ({
  filtype: 'PDF',
  hasAccess,
  format,
  filstoerrelse: format.length * 1000,
  skjerming: null,
});

const ARKIV = variant('ARKIV');
const SLADDET = variant('SLADDET');
const FULLVERSJON = variant('FULLVERSJON');

describe('resolveVariantData', () => {
  it('resolves a plain file type without format or size', () => {
    const result = resolve('PDF', 'SLADDET');

    expect(result.filtype).toBe('PDF');
    expect(result.hasExplicitFormat).toBe(false);
    expect(result.filstoerrelse).toBeUndefined();
    expect(result.selectableFormats).toEqual([]);
  });

  it('resolves a single variant with its size', () => {
    const result = resolve(ARKIV, 'SLADDET');

    expect(result.format).toBe('ARKIV');
    expect(result.filstoerrelse).toBe(ARKIV.filstoerrelse);
    expect(result.hasExplicitFormat).toBe(true);
    expect(result.selectableFormats).toEqual(['ARKIV']);
  });

  it('has no selectable formats for a single inaccessible variant', () => {
    const result = resolve(variant('SLADDET', false), 'SLADDET');

    expect(result.format).toBe('SLADDET');
    expect(result.selectableFormats).toEqual([]);
  });

  it('switches between ARKIV and SLADDET', () => {
    expect(resolve([ARKIV, SLADDET], 'SLADDET').format).toBe('SLADDET');
    expect(resolve([ARKIV, SLADDET], 'ARKIV').format).toBe('ARKIV');
  });

  it('shows ARKIV when the selected format is missing', () => {
    const result = resolve([ARKIV, FULLVERSJON], 'SLADDET');

    expect(result.format).toBe('ARKIV');
    expect(result.filstoerrelse).toBe(ARKIV.filstoerrelse);
    expect(result.selectableFormats).toEqual(['ARKIV', 'FULLVERSJON']);
  });

  it('shows the selected format among three variants', () => {
    const variants: FileVariants = [ARKIV, SLADDET, FULLVERSJON];

    expect(resolve(variants, 'SLADDET').format).toBe('SLADDET');
    expect(resolve(variants, 'ARKIV').format).toBe('ARKIV');
    expect(resolve(variants, 'FULLVERSJON').format).toBe('FULLVERSJON');
    expect(resolve(variants, 'FULLVERSJON').filstoerrelse).toBe(FULLVERSJON.filstoerrelse);
  });

  it('lists selectable formats in display order regardless of input order', () => {
    expect(resolve([FULLVERSJON, ARKIV, SLADDET], 'SLADDET').selectableFormats).toEqual([
      'SLADDET',
      'ARKIV',
      'FULLVERSJON',
    ]);
  });

  it('does not show FULLVERSJON without access', () => {
    const result = resolve([ARKIV, variant('FULLVERSJON', false)], 'FULLVERSJON');

    expect(result.format).toBe('ARKIV');
    expect(result.selectableFormats).toEqual(['ARKIV']);
  });

  it('does not show SLADDET without access', () => {
    const result = resolve([ARKIV, variant('SLADDET', false)], 'SLADDET');

    expect(result.format).toBe('ARKIV');
    expect(result.selectableFormats).toEqual(['ARKIV']);
  });

  it('falls back to SLADDET when ARKIV is selected but inaccessible', () => {
    const result = resolve([variant('ARKIV', false), SLADDET, FULLVERSJON], 'ARKIV');

    expect(result.format).toBe('SLADDET');
    expect(result.selectableFormats).toEqual(['SLADDET', 'FULLVERSJON']);
  });

  it('falls back to SLADDET when ARKIV is selected but missing', () => {
    expect(resolve([SLADDET, FULLVERSJON], 'ARKIV').format).toBe('SLADDET');
  });

  it('falls back to SLADDET when FULLVERSJON is selected but inaccessible', () => {
    expect(resolve([ARKIV, SLADDET, variant('FULLVERSJON', false)], 'FULLVERSJON').format).toBe('SLADDET');
  });

  it('falls back to FULLVERSJON when it is the only accessible variant', () => {
    const variants: FileVariants = [variant('ARKIV', false), variant('SLADDET', false), FULLVERSJON];

    expect(resolve(variants, 'SLADDET').format).toBe('FULLVERSJON');
  });

  it('falls back to SLADDET when unredacted variants are inaccessible', () => {
    const result = resolve([variant('ARKIV', false), SLADDET], 'ARKIV');

    expect(result.format).toBe('SLADDET');
    expect(result.selectableFormats).toEqual(['SLADDET']);
  });

  it('keeps the selected format when no variant is accessible', () => {
    const variants: FileVariants = [variant('ARKIV', false), variant('SLADDET', false)];

    expect(resolve(variants, 'SLADDET').format).toBe('SLADDET');
    expect(resolve(variants, 'ARKIV').format).toBe('ARKIV');
  });
});
