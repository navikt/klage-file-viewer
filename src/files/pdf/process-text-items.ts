import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

const Y_TOLERANCE = 0.1;
const GAP_TOLERANCE = 0.01; // Floating-point tolerance for gap detection
const MERGE_ADJACENCY_TOLERANCE = 0.5; // Maximum gap or overlap (in PDF units) to still merge items
const isWhitespaceOnly = (str: string): boolean => str.trim() === '';

const getX = (item: TextItem): number => item.transform[4];
const getY = (item: TextItem): number => item.transform[5];
const getEndX = (item: TextItem): number => getX(item) + item.width;

/**
 * Processes PDF text items by sorting them and inserting space items for gaps.
 * - Sorts items by y-position (descending) then x-position
 * - Inserts space items between text items when there's a gap
 * - Ensures only the last item on each line has hasEOL=true
 * - Skips zero-width and marked content items
 */
export const processTextItems = (items: (TextItem | TextMarkedContent)[]): TextItem[] => {
  if (items.length === 0) {
    return [];
  }

  // Group items by their y-position (line)
  const lineGroups = new Map<number, TextItem[]>();

  for (const item of items) {
    if ('id' in item) {
      // Skip marked content items
      continue;
    }

    if (item.width === 0) {
      // Skip zero-width items
      continue;
    }

    const y = getY(item);
    let foundGroup = false;

    // Find an existing group with a close y-position
    for (const [groupY, group] of lineGroups) {
      if (Math.abs(y - groupY) <= Y_TOLERANCE) {
        group.push(item);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      lineGroups.set(y, [item]);
    }
  }

  const result: TextItem[] = [];

  // Process each line group
  for (const [, group] of lineGroups) {
    // Sort by x-position
    const sorted = group.toSorted((a, b) => getX(a) - getX(b));

    // Insert space items between text items with gaps, then merge adjacent compatible items
    const withSpaces = insertSpaceItems(sorted);
    const merged = mergeAdjacentItems(withSpaces);
    result.push(...merged);
  }

  // Sort result by y-position (descending, as PDF coordinates start from bottom)
  // then by x-position
  return result.toSorted((a, b) => {
    const yDiff = getY(b) - getY(a);

    if (Math.abs(yDiff) > Y_TOLERANCE) {
      return yDiff;
    }

    return getX(a) - getX(b);
  });
};

const insertSpaceItems = (sortedItems: TextItem[]): TextItem[] => {
  if (sortedItems.length === 0) {
    return [];
  }

  const first = sortedItems[0];

  if (first === undefined) {
    return [];
  }

  const result: TextItem[] = [];
  let previous: TextItem | null = null;

  for (const item of sortedItems) {
    if (previous !== null) {
      const previousEndX = getEndX(previous);
      const itemX = getX(item);
      const gap = itemX - previousEndX;

      // Insert a space item if there's a significant gap and neither item is whitespace-only
      if (gap > GAP_TOLERANCE && !isWhitespaceOnly(previous.str) && !isWhitespaceOnly(item.str)) {
        const spaceItem: TextItem = {
          ...previous,
          str: ' ',
          width: gap,
          transform: [
            previous.transform[0],
            previous.transform[1],
            previous.transform[2],
            previous.transform[3],
            previousEndX,
            previous.transform[5],
          ],
          hasEOL: false,
        };
        result.push(spaceItem);
      }
    }

    result.push({ ...item, hasEOL: false });
    previous = item;
  }

  // Only the last item on the line should have hasEOL=true
  const lastItem = result[result.length - 1];
  if (lastItem !== undefined) {
    lastItem.hasEOL = true;
  }

  return result;
};

/**
 * Merges adjacent text items that share the same font properties into
 * single items with concatenated text. This reduces the number of spans
 * in the text layer, which fixes selection issues in PDFs where each
 * character is its own text item (e.g., Google Docs exports).
 */
const mergeAdjacentItems = (items: TextItem[]): TextItem[] => {
  if (items.length <= 1) {
    return items;
  }

  const [first] = items;

  if (first === undefined) {
    return items;
  }

  const result: TextItem[] = [];
  let current: TextItem = { ...first };

  for (let i = 1; i < items.length; i++) {
    const next = items[i];

    if (next === undefined) {
      continue;
    }

    if (canMerge(current, next)) {
      current = {
        ...current,
        str: current.str + next.str,
        width: getEndX(next) - getX(current),
        hasEOL: next.hasEOL,
      };
    } else {
      result.push(current);
      current = { ...next };
    }
  }

  result.push(current);

  return result;
};

const canMerge = (a: TextItem, b: TextItem): boolean => {
  if (a.fontName !== b.fontName) {
    return false;
  }

  if (a.height !== b.height) {
    return false;
  }

  if (a.dir !== b.dir) {
    return false;
  }

  // Must have same transform scale/rotation components
  if (
    a.transform[0] !== b.transform[0] ||
    a.transform[1] !== b.transform[1] ||
    a.transform[2] !== b.transform[2] ||
    a.transform[3] !== b.transform[3]
  ) {
    return false;
  }

  // Must be adjacent (b starts roughly where a ends)
  const gap = Math.abs(getX(b) - getEndX(a));

  return gap <= MERGE_ADJACENCY_TOLERANCE;
};
