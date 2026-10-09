import { useMemo } from 'react';
import type { DocumentNavigation } from '@/file-header/file-header';
import { resolveVariantData } from '@/file-header/resolve-variant';
import { ExcelSection } from '@/files/excel/excel-section';
import { ImageSection } from '@/files/image/image-section';
import { JsonSection } from '@/files/json/json-section';
import type { PdfSectionSearchInfo } from '@/files/pdf/loaded-pdf-section';
import { PdfSection } from '@/files/pdf/pdf-section';
import type { HighlightRect } from '@/files/pdf/search/types';
import { UnsupportedSection } from '@/files/unsupported/unsupported-section';
import { useVariantFormat } from '@/hooks/use-variant-format';
import type { FileEntry } from '@/types';

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
  const [selectedFormat, selectFormat] = useVariantFormat(file.url);

  const variantData = useMemo(
    () => resolveVariantData(file.variants, selectedFormat, selectFormat),
    [file.variants, selectedFormat, selectFormat],
  );

  const resolvedFile = useMemo<FileEntry>(() => {
    if (!variantData.hasExplicitFormat) {
      return file;
    }

    return { ...file, query: { ...file.query, format: variantData.format } };
  }, [file, variantData.hasExplicitFormat, variantData.format]);

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
