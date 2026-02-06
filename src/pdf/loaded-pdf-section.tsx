import { ArrowsCirclepathIcon } from '@navikt/aksel-icons';
import { Alert, BodyShort, Button, Heading, HStack, Loader, VStack } from '@navikt/ds-react';
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileViewerConfig } from '@/context';
import { getPageScrollTop, scrollToPage } from '@/lib/page-scroll';
import { getA4Dimensions } from '@/pdf/pdf-section-placeholder';
import { RotatablePage } from '@/pdf/rotatable-page';
import type { HighlightRect } from '@/pdf/search/types';
import { StickyHeader } from '@/sticky-header';
import type { PdfFileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

/**
 * Check whether the scroll container has been scrolled to (or past) the
 * reading position for the given page. The reading position is where
 * `scrollToPage` would place the page – right below the sticky header.
 */
const hasReachedPage = (pageElement: HTMLElement, scrollContainer: HTMLElement): boolean =>
  scrollContainer.scrollTop >= getPageScrollTop(pageElement, scrollContainer) - 1;

/**
 * Check whether the scroll container has been scrolled completely past the
 * given page (the page is entirely above the viewport).
 */
const hasPassedPage = (pageElement: HTMLElement, scrollContainer: HTMLElement): boolean =>
  scrollContainer.scrollTop > getPageScrollTop(pageElement, scrollContainer) + pageElement.offsetHeight;

interface LoadedPdfSectionProps {
  pdf: PdfFileEntry;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onPageCountReady: (pageCount: number) => void;
  setPageRef?: (pageNumber: number, element: HTMLDivElement | null) => void;
  highlightsByPage?: Map<number, HighlightRect[]>;
  currentMatchIndex?: number;
}

export const LoadedPdfSection = ({
  pdf,
  scale,
  scrollContainerRef,
  onPageCountReady,
  setPageRef,
  highlightsByPage,
  currentMatchIndex,
}: LoadedPdfSectionProps) => {
  const { errorComponent: ErrorComponent } = useFileViewerConfig();
  const { data, loading, error, refresh } = useFileData(pdf.url, pdf.query);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadedData, setLoadedData] = useState<Blob | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const internalPageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // --- track the most-visible page within this section ---
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null || pages.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let maxVisibility = 0;
        let mostVisiblePage = currentPage;

        for (const entry of entries) {
          const pageNumber = Number.parseInt(entry.target.getAttribute('data-page-number') ?? '1', 10);

          if (entry.intersectionRatio > maxVisibility) {
            maxVisibility = entry.intersectionRatio;
            mostVisiblePage = pageNumber;
          }
        }

        if (maxVisibility > 0) {
          setCurrentPage(mostVisiblePage);
        }
      },
      {
        root: scrollContainer,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const pageRef of internalPageRefs.current.values()) {
      observer.observe(pageRef);
    }

    return () => observer.disconnect();
  }, [pages, currentPage, scrollContainerRef]);

  // --- page navigation with stable target tracking ---
  // `targetPage` is state (for rendering the disabled state without flicker)
  // and mirrored in a ref (so rapid clicks accumulate without waiting for re-renders).
  const [targetPage, setTargetPage] = useState(currentPage);
  const targetPageRef = useRef(currentPage);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced sync: after scrolling settles, align targetPage with currentPage.
  // During a button-triggered smooth scroll the observer fires for intermediate
  // pages – the debounce prevents those transient values from resetting the target.
  useEffect(() => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      targetPageRef.current = currentPage;
      setTargetPage(currentPage);
    }, 150);

    return () => clearTimeout(syncTimerRef.current);
  }, [currentPage]);

  const navigateToPage = useCallback(
    (page: number) => {
      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null) {
        return;
      }

      const clamped = Math.max(1, Math.min(page, pages.length));

      const pageElement = internalPageRefs.current.get(clamped);

      if (pageElement === undefined) {
        return;
      }

      const desiredTop = getPageScrollTop(pageElement, scrollContainer);

      if (clamped === targetPageRef.current && Math.abs(scrollContainer.scrollTop - desiredTop) < 1) {
        return;
      }

      if (clamped !== targetPageRef.current) {
        targetPageRef.current = clamped;
        setTargetPage(clamped);

        // Cancel any pending debounced sync so it does not overwrite
        // the target we just set.
        clearTimeout(syncTimerRef.current);
      }

      scrollToPage(pageElement, scrollContainer, { behavior: 'smooth' });
    },
    [pages.length, scrollContainerRef],
  );

  const onPreviousPage =
    pages.length === 0
      ? undefined
      : () => {
          const target = targetPageRef.current;
          const scrollContainer = scrollContainerRef.current;
          const pageElement = internalPageRefs.current.get(target);

          // If the target page is completely above the viewport (scrolled past),
          // it is itself the "previous" page – bring it back into view.
          const scrollToTarget =
            scrollContainer !== null && pageElement !== undefined && hasPassedPage(pageElement, scrollContainer);

          navigateToPage(scrollToTarget ? target : target - 1);
        };

  const onNextPage =
    pages.length === 0
      ? undefined
      : () => {
          const target = targetPageRef.current;
          const scrollContainer = scrollContainerRef.current;
          const pageElement = internalPageRefs.current.get(target);

          // If the user hasn't scrolled to the target page's reading position yet,
          // it is itself the "next" page – scroll to it instead of skipping past.
          const scrollToTarget =
            scrollContainer !== null && pageElement !== undefined && !hasReachedPage(pageElement, scrollContainer);

          navigateToPage(scrollToTarget ? target : target + 1);
        };
  const previousPageDisabled = targetPage <= 1;
  const nextPageDisabled = targetPage >= pages.length;

  const setInternalPageRef = useCallback(
    (pageNumber: number, element: HTMLDivElement | null) => {
      if (element === null) {
        internalPageRefs.current.delete(pageNumber);
      } else {
        internalPageRefs.current.set(pageNumber, element);
      }

      setPageRef?.(pageNumber, element);
    },
    [setPageRef],
  );

  // --- load PDF document from blob ---
  useEffect(() => {
    if (data === null) {
      setPdfDocument(null);
      setLoadedData(null);

      return;
    }

    const loadPdf = async () => {
      setPdfError(null);

      try {
        const loadingTask = getDocument(await data.arrayBuffer());
        const doc = await loadingTask.promise;
        setPdfDocument(doc);
        setLoadedData(data);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Kunne ikke laste PDF';
        setPdfError(message);
        setLoadedData(data);
        console.error('Error loading PDF:', e);
      }
    };

    loadPdf();
  }, [data]);

  // --- cleanup ---
  useEffect(() => {
    return () => {
      if (pdfDocument !== null) {
        pdfDocument.destroy();
      }
    };
  }, [pdfDocument]);

  // --- load pages from document ---
  useEffect(() => {
    if (pdfDocument === null) {
      setPages([]);

      return;
    }

    const loadPages = async () => {
      const loaded: PDFPageProxy[] = [];

      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        loaded.push(page);
      }

      setPages(loaded);
    };

    loadPages();
  }, [pdfDocument]);

  // Report page count to parent for lazy-loading coordination
  useEffect(() => {
    if (pages.length > 0) {
      onPageCountReady(pages.length);
    }
  }, [pages.length, onPageCountReady]);

  const displayError = error ?? pdfError;
  const pdfLoading = data !== null && data !== loadedData;
  const isLoaderVisible = loading || pdfLoading;

  // Error state
  if (displayError !== undefined && displayError !== null) {
    return (
      <>
        <StickyHeader
          title={pdf.title}
          currentPage={null}
          numPages={null}
          newTab={pdf.newTab}
          downloadUrl={pdf.downloadUrl}
          headerExtra={pdf.headerExtra}
          isLoading={loading}
          refresh={refresh}
        />

        <div className="w-full grow p-5">
          <Alert variant="error" size="small">
            <HStack gap="space-16" align="center">
              <Heading size="small">Feil ved lasting av PDF</Heading>
              {ErrorComponent !== undefined ? <ErrorComponent refresh={refresh} /> : null}
              <Button
                data-color="neutral"
                variant="secondary"
                size="small"
                icon={<ArrowsCirclepathIcon aria-hidden />}
                onClick={refresh}
              >
                Last PDF på nytt
              </Button>
              <code className="border-2 border-ax-border-neutral bg-ax-bg-neutral-moderate p-2 text-xs">
                {displayError}
              </code>
            </HStack>
          </Alert>
        </div>
      </>
    );
  }

  const numPages = pdfDocument?.numPages ?? null;
  const a4 = getA4Dimensions(scale);

  const pageContainerStyle: React.CSSProperties | undefined =
    pages.length === 0 ? { width: a4.width, minHeight: a4.height } : undefined;

  return (
    <>
      <StickyHeader
        title={pdf.title}
        currentPage={currentPage}
        numPages={numPages}
        newTab={pdf.newTab}
        downloadUrl={pdf.downloadUrl}
        headerExtra={pdf.headerExtra}
        isLoading={loading}
        refresh={refresh}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
        previousPageDisabled={previousPageDisabled}
        nextPageDisabled={nextPageDisabled}
      />

      <VStack
        position="relative"
        align="center"
        gap="space-16"
        width="100%"
        style={pageContainerStyle}
        data-klage-file-viewer-document-pages={pages.length}
      >
        {isLoaderVisible ? (
          <div className="absolute top-0 left-0 z-10 flex h-full w-full items-center justify-center bg-ax-bg-neutral-moderate/70 backdrop-blur-xs">
            <VStack align="center" gap="space-8">
              <Loader size="3xlarge" />
              <BodyShort>{loading ? 'Laster PDF ...' : 'Tegner PDF ...'}</BodyShort>
            </VStack>
          </div>
        ) : null}

        {pages.map((page) => {
          const pageHighlights = highlightsByPage?.get(page.pageNumber);

          return (
            <div
              key={page.pageNumber}
              data-page-number={page.pageNumber}
              ref={(el) => {
                setInternalPageRef(page.pageNumber, el);
              }}
              className="mx-auto w-full overflow-x-auto"
            >
              <RotatablePage
                page={page}
                url={pdf.url}
                scale={scale}
                highlights={pageHighlights}
                currentMatchIndex={currentMatchIndex}
              />
            </div>
          );
        })}
      </VStack>
    </>
  );
};
