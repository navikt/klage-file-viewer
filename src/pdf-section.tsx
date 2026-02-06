import { LoadedPdfSection } from './loaded-pdf-section';
import { PdfSectionPlaceholder } from './pdf-section-placeholder';
import type { HighlightRect } from './search/types';
import type { PdfEntry } from './types';

export type { NewTabProps, PdfEntry } from './types';

interface PdfSectionProps {
  pdf: PdfEntry;
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
}

export const PdfSection = ({
  pdf,
  scale,
  scrollContainerRef,
  shouldLoad,
  onPageCountReady,
  setPageRef,
  highlightsByPage,
  currentMatchIndex,
}: PdfSectionProps) => (
  <section className="flex w-full flex-col items-center gap-4">
    {shouldLoad ? (
      <LoadedPdfSection
        pdf={pdf}
        scale={scale}
        scrollContainerRef={scrollContainerRef}
        onPageCountReady={onPageCountReady}
        setPageRef={setPageRef}
        highlightsByPage={highlightsByPage}
        currentMatchIndex={currentMatchIndex}
      />
    ) : (
      <PdfSectionPlaceholder title={pdf.title} scale={scale} />
    )}
  </section>
);
