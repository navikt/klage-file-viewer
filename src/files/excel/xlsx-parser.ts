import type { ExcelSheet } from '@/files/excel/excel-types';
import { unzip } from '@/files/excel/unzip';
import { parseDateStyles } from '@/files/excel/xlsx-date';
import { parseSheet } from '@/files/excel/xlsx-sheet';
import { parseRelationships, parseSharedStrings, parseWorkbook } from '@/files/excel/xlsx-workbook';

/**
 * Parse an xlsx file from an ArrayBuffer into an array of sheets,
 * each containing a name and rows of cell values.
 *
 * Uses the Compression Streams API for zip decompression and `DOMParser`
 * for XML parsing. No third-party dependencies.
 */
export const parseXlsx = async (data: ArrayBuffer): Promise<ExcelSheet[]> => {
  const files = await unzip(data);
  const decoder = new TextDecoder();
  const parser = new DOMParser();

  const getXml = (path: string): Document | null => {
    const raw = files[path];

    if (raw === undefined) {
      return null;
    }

    return parser.parseFromString(decoder.decode(raw), 'application/xml');
  };

  const relMap = parseRelationships(getXml('xl/_rels/workbook.xml.rels'));
  const sheetEntries = parseWorkbook(getXml('xl/workbook.xml'));
  const sharedStrings = parseSharedStrings(getXml('xl/sharedStrings.xml'));
  const dateStyleIndices = parseDateStyles(getXml('xl/styles.xml'));

  return sheetEntries.map(({ name, rId }) => {
    const target = relMap.get(rId);

    if (target === undefined) {
      return { name, rows: [] };
    }

    const sheetDoc = getXml(target);

    if (sheetDoc === null) {
      return { name, rows: [] };
    }

    const rows = parseSheet(sheetDoc, sharedStrings, dateStyleIndices);

    return { name, rows };
  });
};
