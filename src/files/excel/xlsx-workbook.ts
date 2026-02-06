import { byTag } from '@/files/excel/xlsx-xml-utils';

// ---------------------------------------------------------------------------
// Relationship parsing
// ---------------------------------------------------------------------------

export const parseRelationships = (doc: Document | null): Map<string, string> => {
  const map = new Map<string, string>();

  if (doc === null) {
    return map;
  }

  for (const el of byTag(doc, 'Relationship')) {
    const id = el.getAttribute('Id');
    const target = el.getAttribute('Target');

    if (id !== null && target !== null) {
      // Targets can be absolute ("/xl/...") or relative ("worksheets/...")
      map.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
  }

  return map;
};

// ---------------------------------------------------------------------------
// Workbook parsing (sheet names and relationship IDs)
// ---------------------------------------------------------------------------

interface SheetEntry {
  name: string;
  rId: string;
}

const OFFICE_DOC_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export const parseWorkbook = (doc: Document | null): SheetEntry[] => {
  if (doc === null) {
    return [];
  }

  const entries: SheetEntry[] = [];

  for (const el of byTag(doc, 'sheet')) {
    const name = el.getAttribute('name');
    const rId = el.getAttributeNS(OFFICE_DOC_REL_NS, 'id') ?? el.getAttribute('r:id');

    if (name !== null && rId !== null) {
      entries.push({ name, rId });
    }
  }

  return entries;
};

// ---------------------------------------------------------------------------
// Shared strings
// ---------------------------------------------------------------------------

export const parseSharedStrings = (doc: Document | null): string[] => {
  if (doc === null) {
    return [];
  }

  const strings: string[] = [];

  for (const si of byTag(doc, 'si')) {
    // Each <si> can contain a single <t> or multiple <r> (rich text) elements with nested <t>s.
    const texts = byTag(si, 't');
    strings.push(texts.map((t) => t.textContent ?? '').join(''));
  }

  return strings;
};
