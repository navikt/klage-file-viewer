import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import type { ExcelSheet } from '@/files/excel/excel-types';
import { parseXlsx } from '@/files/excel/xlsx-parser';

const CELLS_XLSX_PATH = resolve(import.meta.dir, '../../../dev/public/Cells.xlsx');

const loadCellsXlsx = async (): Promise<ArrayBuffer> => Bun.file(CELLS_XLSX_PATH).arrayBuffer();

let cachedSheets: ExcelSheet[] | null = null;

const getSheets = async (): Promise<ExcelSheet[]> => {
  if (cachedSheets === null) {
    const data = await loadCellsXlsx();
    cachedSheets = await parseXlsx(data);
  }

  return cachedSheets;
};

/** Retrieve a sheet by index, throwing if it doesn't exist. */
const sheetAt = (sheets: ExcelSheet[], index: number): ExcelSheet => {
  const sheet = sheets[index];

  if (sheet === undefined) {
    throw new Error(`Expected sheet at index ${String(index)} but got undefined`);
  }

  return sheet;
};

/** Retrieve a row by index, throwing if it doesn't exist. */
const rowAt = (sheet: ExcelSheet, index: number): ExcelSheet['rows'][number] => {
  const row = sheet.rows[index];

  if (row === undefined) {
    throw new Error(`Expected row at index ${String(index)} in sheet "${sheet.name}" but got undefined`);
  }

  return row;
};

describe('parseXlsx', () => {
  describe('sheet structure', () => {
    it('returns three sheets', async () => {
      const sheets = await getSheets();
      expect(sheets).toHaveLength(3);
    });

    it('returns sheets with correct names in order', async () => {
      const sheets = await getSheets();
      const names = sheets.map((s) => s.name);
      expect(names).toEqual(['Mange celler', 'Typer', 'Ufullstendige rader']);
    });

    it('returns a rows array for each sheet', async () => {
      const sheets = await getSheets();

      for (const sheet of sheets) {
        expect(Array.isArray(sheet.rows)).toBe(true);
      }
    });
  });

  describe('"Mange celler" sheet — grid of strings', () => {
    it('has 20 rows', async () => {
      const sheets = await getSheets();
      const cells = sheetAt(sheets, 0);
      expect(cells.rows).toHaveLength(20);
    });

    it('has 16 columns (A–P) per row', async () => {
      const sheets = await getSheets();
      const cells = sheetAt(sheets, 0);

      for (const row of cells.rows) {
        expect(row).toHaveLength(16);
      }
    });

    it('has correct value in first cell (A1)', async () => {
      const sheets = await getSheets();
      const row = rowAt(sheetAt(sheets, 0), 0);
      expect(row[0]).toBe('Cell A1');
    });

    it('has correct value in last cell (P20)', async () => {
      const sheets = await getSheets();
      const row = rowAt(sheetAt(sheets, 0), 19);
      expect(row[15]).toBe('Cell P20');
    });

    it('has correct values in first row', async () => {
      const sheets = await getSheets();
      const firstRow = rowAt(sheetAt(sheets, 0), 0);
      const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
      const expected = columns.map((col) => `Cell ${col}1`);
      expect(firstRow).toEqual(expected);
    });

    it('has correct values in the last row', async () => {
      const sheets = await getSheets();
      const lastRow = rowAt(sheetAt(sheets, 0), 19);
      const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
      const expected = columns.map((col) => `Cell ${col}20`);
      expect(lastRow).toEqual(expected);
    });

    it('has correct value in a middle cell (H10)', async () => {
      const sheets = await getSheets();
      // H = column index 7, row 10 = index 9
      const row = rowAt(sheetAt(sheets, 0), 9);
      expect(row[7]).toBe('Cell H10');
    });

    it('contains only string values', async () => {
      const sheets = await getSheets();
      const cells = sheetAt(sheets, 0);

      for (const row of cells.rows) {
        for (const cell of row) {
          expect(typeof cell).toBe('string');
        }
      }
    });
  });

  describe('"Typer" sheet — mixed cell types', () => {
    it('has 2 rows', async () => {
      const sheets = await getSheets();
      const typer = sheetAt(sheets, 1);
      expect(typer.rows).toHaveLength(2);
    });

    it('has 5 columns per row', async () => {
      const sheets = await getSheets();
      const typer = sheetAt(sheets, 1);

      for (const row of typer.rows) {
        expect(row).toHaveLength(5);
      }
    });

    it('has correct header row labels', async () => {
      const sheets = await getSheets();
      const header = rowAt(sheetAt(sheets, 1), 0);
      expect(header[0]).toBe('Tall');
      expect(header[1]).toBe('Tall');
      expect(header[2]).toBe('Sum A2 + B2');
      expect(header[3]).toBe('Boolean');
      expect(header[4]).toBe('Dato');
    });

    it('parses numeric cell values', async () => {
      const sheets = await getSheets();
      const dataRow = rowAt(sheetAt(sheets, 1), 1);
      expect(dataRow[0]).toBe(10);
      expect(dataRow[1]).toBe(5);
    });

    it('parses formula result as a number', async () => {
      const sheets = await getSheets();
      const dataRow = rowAt(sheetAt(sheets, 1), 1);
      // "Sum A2 + B2" column (C2) = 10 + 5 = 15
      expect(dataRow[2]).toBe(15);
    });

    it('parses boolean cell value', async () => {
      const sheets = await getSheets();
      const dataRow = rowAt(sheetAt(sheets, 1), 1);
      // "Boolean" column (D2)
      expect(dataRow[3]).toBe(true);
    });

    it('parses date cell value as a Date object', async () => {
      const sheets = await getSheets();
      const dataRow = rowAt(sheetAt(sheets, 1), 1);
      // "Dato" column (E2) = 2026-12-31
      const dateValue = dataRow[4];
      expect(dateValue).toBeInstanceOf(Date);

      if (dateValue instanceof Date) {
        expect(dateValue.getUTCFullYear()).toBe(2026);
        expect(dateValue.getUTCMonth()).toBe(11); // December = 11
        expect(dateValue.getUTCDate()).toBe(31);
      }
    });
  });

  describe('"Ufullstendige rader" — row padding', () => {
    it('has 4 rows', async () => {
      const sheets = await getSheets();
      const sheet3 = sheetAt(sheets, 2);
      expect(sheet3.rows).toHaveLength(4);
    });

    it('has all rows padded to 26 columns (A–Z)', async () => {
      const sheets = await getSheets();
      const sheet3 = sheetAt(sheets, 2);

      for (const row of sheet3.rows) {
        expect(row).toHaveLength(26);
      }
    });

    it('parses row with data at the start and empty trailing cells', async () => {
      const sheets = await getSheets();
      const row = rowAt(sheetAt(sheets, 2), 0);
      // First 6 cells have data, rest are empty
      expect(row[0]).toBe('rad');
      expect(row[1]).toBe('som');
      expect(row[2]).toBe('mangler');
      expect(row[3]).toBe('celler');
      expect(row[4]).toBe('på');
      expect(row[5]).toBe('slutten');

      for (let i = 6; i < row.length; i++) {
        expect(row[i]).toBe('');
      }
    });

    it('parses row with sparse data and gaps in the middle', async () => {
      const sheets = await getSheets();
      const row = rowAt(sheetAt(sheets, 2), 1);
      // Data at A, B, C, D then gap, F=1, gap, gap, I=2, gap..., M=3, rest empty
      expect(row[0]).toBe('rad');
      expect(row[1]).toBe('som');
      expect(row[2]).toBe('mangler');
      expect(row[3]).toBe('celler');
      expect(row[4]).toBe('');
      expect(row[5]).toBe(1);
      expect(row[6]).toBe('');
      expect(row[7]).toBe('');
      expect(row[8]).toBe(2);
      expect(row[12]).toBe(3);
    });

    it('parses row with data at the end and empty leading cells', async () => {
      const sheets = await getSheets();
      const row = rowAt(sheetAt(sheets, 2), 2);

      // First 20 cells are empty
      for (let i = 0; i < 20; i++) {
        expect(row[i]).toBe('');
      }

      // Last 6 cells have data
      expect(row[20]).toBe('rad');
      expect(row[21]).toBe('som');
      expect(row[22]).toBe('mangler');
      expect(row[23]).toBe('celler');
      expect(row[24]).toBe('på');
      expect(row[25]).toBe('starten');
    });

    it('parses row with data only in the middle', async () => {
      const sheets = await getSheets();
      const row = rowAt(sheetAt(sheets, 2), 3);

      // First 7 cells are empty
      for (let i = 0; i < 7; i++) {
        expect(row[i]).toBe('');
      }

      expect(row[7]).toBe('celler');
      expect(row[8]).toBe('bare');
      expect(row[9]).toBe('midt');
      expect(row[10]).toBe('på');

      // Rest are empty
      for (let i = 11; i < row.length; i++) {
        expect(row[i]).toBe('');
      }
    });

    it('fills all gap cells with empty strings', async () => {
      const sheets = await getSheets();
      const sheet3 = sheetAt(sheets, 2);

      for (const row of sheet3.rows) {
        for (const cell of row) {
          // Every cell should be a defined value, never undefined
          expect(cell !== undefined).toBe(true);
        }
      }
    });
  });

  describe('row uniformity across all sheets', () => {
    it('ensures all rows within each sheet have the same length', async () => {
      const sheets = await getSheets();

      for (const sheet of sheets) {
        if (sheet.rows.length === 0) {
          continue;
        }

        const firstRow = rowAt(sheet, 0);
        const expectedLength = firstRow.length;

        for (const [i, row] of sheet.rows.entries()) {
          expect(row.length).toBe(expectedLength);

          if (row.length !== expectedLength) {
            throw new Error(
              `Sheet "${sheet.name}" row ${String(i)} has ${String(row.length)} columns, expected ${String(expectedLength)}`,
            );
          }
        }
      }
    });
  });

  describe('error handling', () => {
    it('throws on empty ArrayBuffer', async () => {
      expect(parseXlsx(new ArrayBuffer(0))).rejects.toThrow();
    });

    it('throws on invalid (non-ZIP) data', async () => {
      const encoder = new TextEncoder();
      const garbage = encoder.encode('this is not an xlsx file');
      expect(parseXlsx(garbage.buffer)).rejects.toThrow();
    });
  });
});
