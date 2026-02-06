import { Box, VStack } from '@navikt/ds-react';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_SCALE } from './constants';
import { type PdfViewerConfig, PdfViewerProvider } from './context';
import { useLazyLoading } from './hooks/use-lazy-loading';
import { useSectionVisibility } from './hooks/use-section-visibility';
import { useZoom } from './hooks/use-zoom';
import { PdfSection } from './pdf-section';
import { PdfToolbar } from './pdf-toolbar';
import type { HighlightRect, PageHighlights } from './search/types';
import type { PdfEntry } from './types';

export type { PdfViewerConfig } from './context';
export type { NewTabProps, PdfEntry } from './types';

export interface PdfDocumentViewerProps {
  /** List of PDFs to render in sequence */
  pdfs: PdfEntry[];
  /** URL to the PDF.js worker script (e.g. `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href`). */
  workerSrc: string;
  /** Shows close button when provided — called when the user clicks the close button */
  onClose?: () => void;
  /** Optional configuration overrides for dark mode, rotation persistence, error handling, etc. */
  config?: Partial<PdfViewerConfig>;
}

const PADDING = 16;

export const PdfDocumentViewer = ({ pdfs, workerSrc, onClose, config }: PdfDocumentViewerProps) => (
  <PdfViewerProvider config={config}>
    <PdfDocumentViewerInner pdfs={pdfs} workerSrc={workerSrc} onClose={onClose} />
  </PdfViewerProvider>
);

interface PdfDocumentViewerInnerProps {
  pdfs: PdfEntry[];
  workerSrc: string;
  onClose?: () => void;
}

const PdfDocumentViewerInner = ({ pdfs, workerSrc, onClose }: PdfDocumentViewerInnerProps) => {
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [searchHighlights, setSearchHighlights] = useState<PageHighlights[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Configure PDF.js worker (idempotent — safe to call on every render).
  useEffect(() => {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }, [workerSrc]);

  const isSinglePdf = pdfs.length === 1;

  const { loadedSectionCount, handlePageCountReady } = useLazyLoading({
    sectionCount: pdfs.length,
    scrollContainerRef,
  });

  const { currentDocumentIndex, setSectionRef } = useSectionVisibility({
    sectionCount: pdfs.length,
    scrollContainerRef,
  });

  const { handleKeyDown } = useZoom({
    containerRef,
    setScale,
    isSinglePdf,
    onOpenSearch: () => {
      setIsSearchOpen(true);
      searchInputRef.current?.focus();
    },
  });

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, HighlightRect[]>();

    for (const { pageNumber, highlights } of searchHighlights) {
      map.set(pageNumber, highlights);
    }

    return map;
  }, [searchHighlights]);

  const setPageRef = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element === null) {
      pageRefs.current.delete(pageNumber);
    } else {
      pageRefs.current.set(pageNumber, element);
    }
  }, []);

  return (
    <VStack asChild width="min-content" height="100%" flexGrow="1" align="center" justify="center">
      <Box as="section" background="default" shadow="dialog" borderRadius="4" position="relative">
        <VStack
          ref={containerRef}
          width="100%"
          height="100%"
          overflow="hidden"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="outline-ax-accent-500 focus-within:outline"
        >
          <PdfToolbar
            scale={scale}
            setScale={setScale}
            scrollContainerRef={scrollContainerRef}
            padding={PADDING}
            isSinglePdf={isSinglePdf}
            isSearchOpen={isSearchOpen}
            setIsSearchOpen={setIsSearchOpen}
            pageRefs={pageRefs}
            onHighlightsChange={setSearchHighlights}
            currentMatchIndex={currentMatchIndex}
            onCurrentMatchIndexChange={setCurrentMatchIndex}
            searchInputRef={searchInputRef}
            currentDocumentIndex={currentDocumentIndex}
            totalDocuments={pdfs.length}
            onClose={onClose}
          />

          {/* ---- scrollable container with all PDF sections ---- */}
          <VStack
            ref={scrollContainerRef}
            align="center"
            height="100%"
            padding={`space-${PADDING}`}
            overflow="auto"
            position="relative"
            flexGrow="1"
            gap="space-16"
          >
            {pdfs.map((pdf, index) => (
              <div
                key={pdf.url}
                data-section-index={index}
                ref={(el) => setSectionRef(index, el)}
                className="flex w-full flex-col items-center gap-4"
              >
                <PdfSection
                  pdf={pdf}
                  scale={scale}
                  scrollContainerRef={scrollContainerRef}
                  shouldLoad={index < loadedSectionCount}
                  onPageCountReady={(pageCount) => handlePageCountReady(index, pageCount)}
                  setPageRef={isSinglePdf ? setPageRef : undefined}
                  highlightsByPage={isSinglePdf ? highlightsByPage : undefined}
                  currentMatchIndex={isSinglePdf ? currentMatchIndex : undefined}
                />
              </div>
            ))}
          </VStack>
        </VStack>
      </Box>
    </VStack>
  );
};
