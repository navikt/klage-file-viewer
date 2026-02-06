import type { CellValue, Row } from '@/files/excel/excel-types';
import { excelSerialToDate } from '@/files/excel/xlsx-date';
import { byTag, firstByTag } from '@/files/excel/xlsx-xml-utils';

const EMPTY_CELL = '';

/**
 * Parse all rows from a worksheet XML document.
 */
export const parseSheet = (doc: Document, sharedStrings: string[], dateStyleIndices: Set<number>): Row[] => {
  const rows: Row[] = [];

  for (const rowEl of byTag(doc, 'row')) {
    const rowNumber = Number(rowEl.getAttribute('r'));

    if (Number.isNaN(rowNumber) || rowNumber < 1) {
      continue;
    }

    const rowIndex = rowNumber - 1;

    // Ensure the rows array covers this index, filling gaps with empty rows.
    while (rows.length <= rowIndex) {
      rows.push([]);
    }

    const row: Row = [];

    for (const cellEl of byTag(rowEl, 'c')) {
      const ref = cellEl.getAttribute('r');

      if (ref === null) {
        continue;
      }

      const colIndex = columnRefToIndex(ref);
      const value = parseCellValue(cellEl, sharedStrings, dateStyleIndices);

      // Pad with empty strings if there are gaps between columns.
      if (row.length <= colIndex) {
        padRow(row, colIndex);
      }

      row[colIndex] = value;
    }

    rows[rowIndex] = row;
  }

  // Pad all rows to equal length so the table renders correctly.
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);

  if (maxCols > 0) {
    for (const row of rows) {
      if (row.length < maxCols) {
        padRow(row, maxCols - 1);
      }
    }
  }

  return rows;
};

/** Extract a typed cell value from a `<c>` element. */
const parseCellValue = (cellEl: Element, sharedStrings: string[], dateStyleIndices: Set<number>): CellValue => {
  const cellType = cellEl.getAttribute('t');
  const styleIndex = Number(cellEl.getAttribute('s') ?? '0');
  const vEl = firstByTag(cellEl, 'v');
  const rawValue = vEl?.textContent ?? '';

  switch (cellType) {
    // Shared string
    case 's':
      return sharedStrings[Number(rawValue)] ?? '';

    // Boolean
    case 'b':
      return rawValue === '1';

    // Inline string (<is><t>…</t></is>)
    case 'inlineStr': {
      const isEl = firstByTag(cellEl, 'is');

      if (isEl === undefined) {
        return rawValue;
      }

      return byTag(isEl, 't')
        .map((t) => t.textContent ?? '')
        .join('');
    }

    // Explicit string (e.g. formula result)
    case 'str':
      return rawValue;

    // Error
    case 'e':
      return rawValue;

    // Number (default when no type attribute) — may also be a date.
    default: {
      if (rawValue === '') {
        return '';
      }

      const num = Number(rawValue);

      if (Number.isNaN(num)) {
        return rawValue;
      }

      if (dateStyleIndices.has(styleIndex)) {
        return excelSerialToDate(num);
      }

      return num;
    }
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad a row with empty cells so that `row.length` becomes `targetIndex + 1`. */
const padRow = (row: Row, targetIndex: number): void => {
  const start = row.length;
  row.length = targetIndex + 1;
  row.fill(EMPTY_CELL, start);
};

/**
 * Parse the column letters from a cell reference (e.g. "A1", "AA123") into a
 * zero-based column index.
 *
 * "A" → 0, "B" → 1, … "Z" → 25, "AA" → 26, "AB" → 27, …
 */
const columnRefToIndex = (ref: string): number => {
  let col = 0;

  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);

    // Stop at the first character that isn't an uppercase letter.
    if (code < 65 || code > 90) {
      break;
    }

    col = col * 26 + (code - 64);
  }

  return col - 1;
};
