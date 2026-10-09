const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;
const BASE = 1024;

const formatter = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });

/** Format a size in bytes as a human-readable string, e.g. `1,5 MB`. */
export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }

  let value = bytes;
  let unitIndex = 0;

  // Compare the rounded value so e.g. 1023.96 kB becomes 1 MB instead of 1 024 kB.
  while (roundToOneDecimal(value) >= BASE && unitIndex < UNITS.length - 1) {
    value /= BASE;
    unitIndex += 1;
  }

  return `${formatter.format(value)}\u00A0${UNITS[unitIndex]}`;
};

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

/** Append the formatted file size to a label, e.g. `Last ned (1,5 MB)`, when the size is known. */
export const withFileSize = (label: string, bytes: number | undefined): string => {
  const size = bytes === undefined ? '' : formatFileSize(bytes);

  return size === '' ? label : `${label} (${size})`;
};
