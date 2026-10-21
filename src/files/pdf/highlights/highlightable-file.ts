import type { FileEntry, FileType, FileVariants } from '@/types';

/** File types with text that can be highlighted. */
const HIGHLIGHTABLE_TYPES: ReadonlySet<FileType> = new Set(['PDF']);

export const isHighlightableType = (filtype: FileType): boolean => HIGHLIGHTABLE_TYPES.has(filtype);

/** Whether any variant of the file can be highlighted. */
export const isHighlightableFile = ({ highlightsId, variants }: FileEntry): boolean =>
  highlightsId !== undefined && getFileTypes(variants).some(isHighlightableType);

const getFileTypes = (variants: FileVariants): FileType[] => {
  if (typeof variants === 'string') {
    return [variants];
  }

  return Array.isArray(variants) ? variants.map(({ filtype }) => filtype) : [variants.filtype];
};
