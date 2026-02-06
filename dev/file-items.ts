import type { ApiFileInfo, AvailableItem, DocumentItem, DocumentVariantInfo, FileType, FlatItem } from '@dev/types';
import { buildNewTabUrl } from '@dev/url-helpers';
import type { FileEntry, FileVariant } from '@/types';

// --- Regex patterns ---

const PDF_EXTENSION_REGEX = /\.pdf$/i;
const EXCEL_EXTENSION_REGEX = /\.xlsx?$/i;
const JPEG_EXTENSION_REGEX = /\.jpe?g$/i;
const PNG_EXTENSION_REGEX = /\.png$/i;
const TIFF_EXTENSION_REGEX = /\.tiff?$/i;
const JSON_EXTENSION_REGEX = /\.json$/i;

const EXTENSION_REGEX_BY_TYPE: Record<FileType, RegExp> = {
  PDF: PDF_EXTENSION_REGEX,
  XLSX: EXCEL_EXTENSION_REGEX,
  JPEG: JPEG_EXTENSION_REGEX,
  PNG: PNG_EXTENSION_REGEX,
  TIFF: TIFF_EXTENSION_REGEX,
  JSON: JSON_EXTENSION_REGEX,
};

// --- File type detection ---

const getFileType = (filename: string): FileType | null => {
  if (PDF_EXTENSION_REGEX.test(filename)) {
    return 'PDF';
  }

  if (EXCEL_EXTENSION_REGEX.test(filename)) {
    return 'XLSX';
  }

  if (JPEG_EXTENSION_REGEX.test(filename)) {
    return 'JPEG';
  }

  if (PNG_EXTENSION_REGEX.test(filename)) {
    return 'PNG';
  }

  if (TIFF_EXTENSION_REGEX.test(filename)) {
    return 'TIFF';
  }

  if (JSON_EXTENSION_REGEX.test(filename)) {
    return 'JSON';
  }

  return null;
};

// --- API-to-model mapping ---

const apiInfoToItem = (info: ApiFileInfo): AvailableItem | null => {
  if (info.type === 'file') {
    const fileType = getFileType(info.filename);

    if (fileType === null) {
      return null;
    }

    return {
      key: `file:${info.filename}`,
      displayName: info.filename.replace(EXTENSION_REGEX_BY_TYPE[fileType], ''),
      fileType,
      isDocument: false,
      filename: info.filename,
    };
  }

  // Document (folder-based)
  return {
    key: `doc:${info.name}`,
    displayName: info.name,
    fileType: 'PDF',
    isDocument: true,
    name: info.name,
    variants: info.variants,
  };
};

// --- Download URL builders ---

const buildFlatDownloadUrl = (filename: string): string => `/api/download?file=${encodeURIComponent(filename)}`;

const buildDocumentDownloadUrl = (name: string, format: 'ARKIV' | 'SLADDET'): string =>
  `/api/download?document=${encodeURIComponent(name)}&format=${format}`;

// --- FileEntry builders ---

const flatItemToFileEntry = (item: FlatItem): FileEntry => {
  const newTabUrl = buildNewTabUrl([item.key]);
  const downloadUrl = buildFlatDownloadUrl(item.filename);

  return {
    variants: item.fileType,
    title: item.displayName,
    url: `/${item.filename}`,
    downloadUrl,
    newTabUrl,
  };
};

const documentItemToFileEntry = (item: DocumentItem): FileEntry => {
  const newTabUrl = buildNewTabUrl([item.key]);

  const hasArkiv = item.variants.some((v: DocumentVariantInfo) => v.format === 'ARKIV');
  const hasSladdet = item.variants.some((v: DocumentVariantInfo) => v.format === 'SLADDET');

  // Determine which format to use for the initial fetch
  const initialFormat: 'ARKIV' | 'SLADDET' = hasSladdet ? 'SLADDET' : 'ARKIV';
  const downloadUrl = buildDocumentDownloadUrl(item.name, initialFormat);

  const documentUrl = `/api/document/${encodeURIComponent(item.name)}`;

  // If we have both variants, use a tuple
  if (hasArkiv && hasSladdet) {
    const arkivVariant: FileVariant = {
      filtype: 'PDF',
      hasAccess: true,
      format: 'ARKIV',
      skjerming: null,
    };

    const sladdetVariant: FileVariant = {
      filtype: 'PDF',
      hasAccess: true,
      format: 'SLADDET',
      skjerming: null,
    };

    return {
      variants: [arkivVariant, sladdetVariant],
      title: item.displayName,
      url: documentUrl,
      query: { format: initialFormat },
      downloadUrl,
      newTabUrl,
    };
  }

  // Single variant
  const format = initialFormat;

  return {
    variants: {
      filtype: 'PDF',
      hasAccess: true,
      format,
      skjerming: null,
    },
    title: item.displayName,
    url: documentUrl,
    query: { format },
    downloadUrl,
    newTabUrl,
  };
};

const itemToFileEntry = (item: AvailableItem): FileEntry => {
  if (item.isDocument) {
    return documentItemToFileEntry(item);
  }

  return flatItemToFileEntry(item);
};

export { apiInfoToItem, itemToFileEntry };
