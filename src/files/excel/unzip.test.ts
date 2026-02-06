import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { unzip } from '@/files/excel/unzip';

const CELLS_XLSX_PATH = resolve(import.meta.dir, '../../../dev/public/Cells.xlsx');

const loadCellsXlsx = async (): Promise<ArrayBuffer> => Bun.file(CELLS_XLSX_PATH).arrayBuffer();

describe('unzip', () => {
  describe('extraction', () => {
    it('extracts all entries from the xlsx archive', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);
      const paths = Object.keys(files);

      expect(paths.length).toBeGreaterThan(0);
    });

    it('contains required xlsx XML files', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);
      const paths = Object.keys(files);

      expect(paths).toContain('[Content_Types].xml');
      expect(paths).toContain('_rels/.rels');
      expect(paths).toContain('xl/workbook.xml');
      expect(paths).toContain('xl/_rels/workbook.xml.rels');
      expect(paths).toContain('xl/styles.xml');
      expect(paths).toContain('xl/sharedStrings.xml');
    });

    it('contains worksheet entries for each sheet', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);
      const paths = Object.keys(files);

      expect(paths).toContain('xl/worksheets/sheet1.xml');
      expect(paths).toContain('xl/worksheets/sheet2.xml');
      expect(paths).toContain('xl/worksheets/sheet3.xml');
    });

    it('does not include directory entries', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);
      const paths = Object.keys(files);

      for (const path of paths) {
        expect(path.endsWith('/')).toBe(false);
      }
    });
  });

  describe('file contents', () => {
    it('returns Uint8Array values for each entry', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);

      for (const content of Object.values(files)) {
        expect(content).toBeInstanceOf(Uint8Array);
      }
    });

    it('returns non-empty content for XML entries', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);

      const xmlPaths = ['xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml'];

      for (const path of xmlPaths) {
        const content = files[path];
        expect(content).toBeDefined();
        expect(content?.length).toBeGreaterThan(0);
      }
    });

    it('decompresses XML content into valid UTF-8 text', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);
      const decoder = new TextDecoder();

      const workbook = files['xl/workbook.xml'];
      expect(workbook).toBeDefined();

      const text = decoder.decode(workbook);
      expect(text).toStartWith('<?xml');
      expect(text).toContain('<workbook');
    });

    it('decompresses shared strings into valid XML with string entries', async () => {
      const data = await loadCellsXlsx();
      const files = await unzip(data);
      const decoder = new TextDecoder();

      const sharedStrings = files['xl/sharedStrings.xml'];
      expect(sharedStrings).toBeDefined();

      const text = decoder.decode(sharedStrings);
      expect(text).toContain('<si>');
      expect(text).toContain('<t>');
    });
  });

  describe('error handling', () => {
    it('throws on empty data', async () => {
      const empty = new ArrayBuffer(0);
      expect(unzip(empty)).rejects.toThrow();
    });

    it('throws on random non-ZIP data', async () => {
      const random = new Uint8Array(256);

      for (let i = 0; i < random.length; i++) {
        random[i] = Math.floor(Math.random() * 256);
      }

      expect(unzip(random.buffer)).rejects.toThrow();
    });

    it('throws on truncated ZIP data', async () => {
      const data = await loadCellsXlsx();
      const truncated = data.slice(0, 100);
      expect(unzip(truncated)).rejects.toThrow();
    });
  });
});
