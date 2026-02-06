import { byTag, firstByTag } from '@/files/excel/xlsx-xml-utils';

const DATE_TOKEN_REGEX = /[dmyhs]/i;
const NUMERIC_ONLY_REGEX = /^[#0.,;%E+\-() ]+$/;
const MS_PER_DAY = 86_400_000;

/**
 * Built-in Excel number format IDs that represent date/time formats.
 * @see ECMA-376 Part 1, 18.8.30
 */
const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56,
  57, 58,
]);

export const parseDateStyles = (doc: Document | null): Set<number> => {
  const indices = new Set<number>();

  if (doc === null) {
    return indices;
  }

  // Collect custom number formats from <numFmts>
  const customFormats = new Map<number, string>();

  for (const fmt of byTag(doc, 'numFmt')) {
    const id = Number(fmt.getAttribute('numFmtId'));
    const code = fmt.getAttribute('formatCode') ?? '';
    customFormats.set(id, code);
  }

  // Walk <xf> entries inside <cellXfs> to find which style indices use a date format.
  const cellXfs = firstByTag(doc, 'cellXfs');

  if (cellXfs === undefined) {
    return indices;
  }

  const xfs = byTag(cellXfs, 'xf');

  for (const [i, xf] of xfs.entries()) {
    const numFmtId = Number(xf.getAttribute('numFmtId') ?? '0');

    if (isDateFormat(numFmtId, customFormats)) {
      indices.add(i);
    }
  }

  return indices;
};

/** Determine whether a number format ID represents a date/time format. */
const isDateFormat = (numFmtId: number, customFormats: Map<number, string>): boolean => {
  if (BUILTIN_DATE_FORMAT_IDS.has(numFmtId)) {
    return true;
  }

  const fmt = customFormats.get(numFmtId);

  if (fmt === undefined) {
    return false;
  }

  // Strip quoted literals and escaped characters, then check for date/time tokens.
  const cleaned = fmt.replace(/"[^"]*"|\\./g, '');

  return DATE_TOKEN_REGEX.test(cleaned) && !NUMERIC_ONLY_REGEX.test(cleaned);
};

/**
 * Convert an Excel serial date number to a JavaScript `Date`.
 *
 * Excel uses a serial system where 1 = January 1, 1900. It also incorrectly
 * considers 1900 a leap year (the Lotus 1-2-3 bug), inserting a phantom
 * February 29, 1900 at serial 60.
 */
export const excelSerialToDate = (serial: number): Date => {
  // Compensate for the Lotus 1-2-3 leap year bug.
  const adjusted = serial > 60 ? serial - 1 : serial;

  // Excel serial 1 = January 1, 1900.
  // There are 25567 real days between January 1, 1900 and the Unix epoch
  // (January 1, 1970). Since serial 1 maps to January 1, 1900, the offset is
  // 25568: (adjusted - 25568) * MS_PER_DAY gives the Unix timestamp.
  return new Date(Math.round((adjusted - 25568) * MS_PER_DAY));
};
