import { useMemo } from 'react';
import type { DocumentNavigation } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { ExcelSection } from '@/files/excel/excel-section';
import { ImageSection } from '@/files/image/image-section';
import { JsonSection } from '@/files/json/json-section';
import type { PdfSectionSearchInfo } from '@/files/pdf/loaded-pdf-section';
import { PdfSection } from '@/files/pdf/pdf-section';
import type { HighlightRect } from '@/files/pdf/search/types';
import { UnsupportedSection } from '@/files/unsupported/unsupported-section';
import { useRedacted } from '@/hooks/use-redacted';
import type { FileEntry, FileVariants } from '@/types';

interface FileSectionProps {
  file: FileEntry;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether this section should load its data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading its pages so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** Called when a PDF section's searchable state changes (engine/doc/rotations available or cleared). */
  onSearchableReady?: (info: PdfSectionSearchInfo | null) => void;
  /** Search highlights keyed by page number */
  highlightsByPage?: Map<number, HighlightRect[]>;
  currentMatchIndex?: number;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const FileSection = ({
  file,
  scale,
  scrollContainerRef,
  shouldLoad,
  onPageCountReady,
  onSearchableReady,
  highlightsByPage,
  currentMatchIndex,
  documentNavigation,
}: FileSectionProps) => {
  const { showRedacted, setShowRedacted } = useRedacted(file.url, file.variants);

  const variantData = useMemo(
    () => resolveVariantData(file.variants, showRedacted, setShowRedacted),
    [file.variants, showRedacted, setShowRedacted],
  );

  const resolvedFile = useMemo<FileEntry>(() => {
    if (!variantData.hasRedactedDocuments || !variantData.hasAccessToArchivedDocuments) {
      return file;
    }

    return { ...file, query: { ...file.query, format: variantData.format } };
  }, [file, variantData.hasRedactedDocuments, variantData.hasAccessToArchivedDocuments, variantData.format]);

  switch (variantData.filtype) {
    case 'PDF':
      return (
        <PdfSection
          file={resolvedFile}
          headerVariant={variantData}
          scale={scale}
          scrollContainerRef={scrollContainerRef}
          shouldLoad={shouldLoad}
          onPageCountReady={onPageCountReady}
          onSearchableReady={onSearchableReady}
          highlightsByPage={highlightsByPage}
          currentMatchIndex={currentMatchIndex}
          documentNavigation={documentNavigation}
        />
      );

    case 'XLSX':
      return (
        <ExcelSection
          file={resolvedFile}
          headerVariant={variantData}
          scrollContainerRef={scrollContainerRef}
          shouldLoad={shouldLoad}
          onPageCountReady={onPageCountReady}
          documentNavigation={documentNavigation}
        />
      );

    case 'JPEG':
    case 'PNG':
    case 'TIFF':
      return (
        <ImageSection
          file={resolvedFile}
          headerVariant={variantData}
          scale={scale}
          shouldLoad={shouldLoad}
          onPageCountReady={onPageCountReady}
          documentNavigation={documentNavigation}
        />
      );

    case 'JSON':
      return (
        <JsonSection
          file={resolvedFile}
          headerVariant={variantData}
          shouldLoad={shouldLoad}
          onPageCountReady={onPageCountReady}
          documentNavigation={documentNavigation}
        />
      );

    default:
      return (
        <UnsupportedSection
          file={resolvedFile}
          headerVariant={variantData}
          scale={scale}
          onPageCountReady={onPageCountReady}
          documentNavigation={documentNavigation}
        />
      );
  }
};

/** Collapse the {@link FileVariants} union into a single active variant with redacted-switch state. */
const resolveVariantData = (
  variants: FileVariants,
  showRedacted: boolean,
  setShowRedacted: (showRedacted: boolean) => void,
): ResolvedVariant => {
  if (typeof variants === 'string') {
    return {
      filtype: variants,
      hasAccess: true,
      format: 'ARKIV',
      skjerming: null,
      hasRedactedDocuments: false,
      hasAccessToArchivedDocuments: false,
      showRedacted,
      setShowRedacted,
    };
  }

  if (!Array.isArray(variants)) {
    return {
      ...variants,
      hasRedactedDocuments: variants.format === 'SLADDET',
      hasAccessToArchivedDocuments: false,
      showRedacted,
      setShowRedacted,
    };
  }

  const redactedVariant = variants.find(({ format }) => format === 'SLADDET');
  const archiveVariant = variants.find(({ format }) => format === 'ARKIV');
  const hasRedactedDocuments = redactedVariant !== undefined;
  const hasAccessToArchivedDocuments = archiveVariant?.hasAccess ?? false;

  const active =
    showRedacted && hasRedactedDocuments
      ? (redactedVariant ?? archiveVariant ?? variants[0])
      : (archiveVariant ?? redactedVariant ?? variants[0]);

  return {
    ...active,
    hasRedactedDocuments,
    hasAccessToArchivedDocuments,
    showRedacted,
    setShowRedacted,
  };
};
