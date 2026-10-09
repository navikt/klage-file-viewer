import { describe, expect, it } from 'bun:test';
import { formatFileSize, withFileSize } from '@/lib/format-file-size';

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0\u00A0B');
    expect(formatFileSize(512)).toBe('512\u00A0B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1\u00A0kB');
    expect(formatFileSize(1536)).toBe('1,5\u00A0kB');
  });

  it('formats megabytes and gigabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5\u00A0MB');
    expect(formatFileSize(1.25 * 1024 * 1024 * 1024)).toBe('1,3\u00A0GB');
  });

  it('moves to the next unit when rounding reaches the base', () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1\u00A0MB');
    expect(formatFileSize(1023.94 * 1024)).toBe('1\u00A0023,9\u00A0kB');
  });

  it('returns an empty string for invalid sizes', () => {
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
  });
});

describe('withFileSize', () => {
  it('appends the formatted size', () => {
    expect(withFileSize('Last ned', 1536)).toBe('Last ned (1,5\u00A0kB)');
  });

  it('returns the label when the size is unknown or invalid', () => {
    expect(withFileSize('Last ned', undefined)).toBe('Last ned');
    expect(withFileSize('Last ned', -1)).toBe('Last ned');
  });
});
