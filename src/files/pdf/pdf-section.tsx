import type { DocumentNavigation } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { LoadedPdfSection } from '@/files/pdf/loaded-pdf-section';
import { PdfSectionPlaceholder } from '@/files/pdf/pdf-section-placeholder';
import type { HighlightRect } from '@/files/pdf/search/types';
import type { FileEntry } from '@/types';

interface PdfSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether this section should load its PDF data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading its pages so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** Shared map so the parent (and search) can reference page elements */
  setPageRef?: (pageNumber: number, element: HTMLDivElement | null) => void;
  /** Search highlights keyed by page number */
  highlightsByPage?: Map<number, HighlightRect[]>;
  currentMatchIndex?: number;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const PdfSection = ({
  file,
  headerVariant,
  scale,
  scrollContainerRef,
  shouldLoad,
  onPageCountReady,
  setPageRef,
  highlightsByPage,
  currentMatchIndex,
  documentNavigation,
}: PdfSectionProps) => (
  <section className="flex w-full flex-col items-center gap-4">
    {shouldLoad ? (
      <LoadedPdfSection
        file={file}
        headerVariant={headerVariant}
        scale={scale}
        scrollContainerRef={scrollContainerRef}
        onPageCountReady={onPageCountReady}
        setPageRef={setPageRef}
        highlightsByPage={highlightsByPage}
        currentMatchIndex={currentMatchIndex}
        documentNavigation={documentNavigation}
      />
    ) : (
      <PdfSectionPlaceholder title={file.title} scale={scale} />
    )}
  </section>
);
