import type { PdfDocumentObject, PdfEngine, Rotation } from '@embedpdf/models';
import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileViewerConfig } from '@/context';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { FileErrorLayout } from '@/files/file-error-layout';
import { PdfPage } from '@/files/pdf/page/pdf-page';
import { usePersistedRotations } from '@/files/pdf/page/use-persisted-rotations';
import { useVisiblePages } from '@/files/pdf/page/use-visible-pages';
import { PasswordPrompt } from '@/files/pdf/password/password-prompt';
import { PasswordProtectedInfoCard } from '@/files/pdf/password/password-protected-info-card';
import { usePdfEngine } from '@/files/pdf/pdf-engine-context';
import { PlaceholderWrapper } from '@/files/pdf/pdf-section-placeholder';
import type { HighlightRect } from '@/files/pdf/search/types';
import { useCopyHandler } from '@/files/pdf/selection/copy/use-copy-handler';
import { useDocumentPointerTracking } from '@/files/pdf/selection/use-document-pointer-tracking';
import { useTextSelection } from '@/files/pdf/selection/use-text-selection';
import { PasswordStatus, usePdfDocument } from '@/files/pdf/use-pdf-document';
import { useRegisterRefresh } from '@/hooks/use-refresh-registry';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { getMostVisiblePage } from '@/lib/page-scroll';
import { usePrint } from '@/lib/print-frame';
import { useToolbarHeight } from '@/toolbar-height-context';
import type { FileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

export interface PdfSectionSearchInfo {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  rotations: Map<number, Rotation>;
}

interface LoadedPdfSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onPageCountReady: (pageCount: number) => void;
  onSearchableReady?: (info: PdfSectionSearchInfo | null) => void;
  highlightsByPage?: Map<number, HighlightRect[]>;
  currentMatchIndex?: number;
  documentNavigation?: DocumentNavigation;
}

export const LoadedPdfSection = ({
  file,
  headerVariant,
  scale,
  scrollContainerRef,
  onPageCountReady,
  onSearchableReady,
  highlightsByPage,
  currentMatchIndex,
  documentNavigation,
}: LoadedPdfSectionProps) => {
  const { data, loading, fetching, error, refresh } = useFileData(file.url, file.query);
  const { engine, isLoading: engineLoading, error: engineError } = usePdfEngine();
  const { commonPasswords } = useFileViewerConfig();
  const toolbarHeight = useToolbarHeight();

  const { printBlob } = usePrint();

  useRegisterRefresh(file.url, refresh);

  const {
    doc,
    loading: docLoading,
    error: docError,
    passwordState,
    usedPassword,
    autoTryingPasswords,
    submitPassword,
  } = usePdfDocument(engine, data, { commonPasswords, fileUrl: file.url });

  // Per-page rotation state, persisted to localStorage per file URL + page index.
  const { rotations, handleRotate } = usePersistedRotations(file.url, doc?.pageCount ?? 0);

  const handlePrint = useCallback(() => {
    if (data !== null) {
      printBlob(data, 'application/pdf');
    }
  }, [data, printBlob]);

  // Text selection
  const {
    selection,
    isSelecting,
    clearSelection,
    handleMouseDown,
    handlePointerMove,
    handlePointerUp,
    getPageSelectionRange,
    geometryRegistry,
  } = useTextSelection();

  const copyTargetRef = useCopyHandler(engine, doc, selection, geometryRegistry);

  // Ref for registered page DOM elements — used by both document-level pointer
  // tracking (cross-page selection) and page navigation (scroll-to-page).
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map());

  // Document-level pointer tracking for cross-page selection.
  // Uses pageElementsRef (populated by handleRegisterElement below) to
  // determine which page the pointer is over during a drag.
  useDocumentPointerTracking({
    isSelecting,
    doc,
    scale,
    rotations,
    geometryRegistry,
    pageElementsRef,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  });

  // Expose search info to parent whenever engine/doc/rotations change
  useEffect(() => {
    if (engine !== null && doc !== null) {
      onSearchableReady?.({ engine, doc, rotations });
    } else {
      onSearchableReady?.(null);
    }
  }, [engine, doc, rotations, onSearchableReady]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      onSearchableReady?.(null);
    };
  }, [onSearchableReady]);

  // Visibility tracking
  const { visiblePages, setPageElement } = useVisiblePages(scrollContainerRef, doc?.pageCount ?? 0);

  // Report page count once known
  useEffect(() => {
    if (doc !== null) {
      onPageCountReady(doc.pageCount);
    }
  }, [doc, onPageCountReady]);

  // Current page tracking via scroll
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [hasOcr, setHasOcr] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Stable target tracking — mirrors the pattern in usePageNavigation.
  // `targetPage` drives the disabled state so that intermediate scroll events
  // during a smooth scroll don't flip the button to disabled/fallback, which
  // would cause Chrome to cancel the ongoing smooth scroll.
  const [targetPage, setTargetPage] = useState<number | null>(null);
  const targetPageRef = useRef<number | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      targetPageRef.current = currentPage;
      setTargetPage(currentPage);
    }, 150);

    return () => clearTimeout(syncTimerRef.current);
  }, [currentPage]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null || doc === null) {
      return;
    }

    const updateCurrentPage = () => {
      const page = getMostVisiblePage(scrollContainer, toolbarHeight);

      if (page === null) {
        return;
      }

      const attr = page.getAttribute('data-klage-file-viewer-page-number');

      if (attr === null) {
        return;
      }

      const pageNumber = Number.parseInt(attr, 10);

      if (!Number.isNaN(pageNumber)) {
        setCurrentPage(pageNumber);
      }
    };

    const handleScroll = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(updateCurrentPage);
    };

    // Initial calculation
    updateCurrentPage();

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scrollContainerRef, doc, toolbarHeight]);

  // Page navigation callbacks
  const scrollToPage = useScrollToPage();

  const navigateToPage = useCallback(
    (pageNumber: number) => {
      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null || doc === null) {
        return;
      }

      const clamped = Math.max(1, Math.min(pageNumber, doc.pageCount));
      const target = pageElementsRef.current.get(clamped);

      if (target === undefined) {
        return;
      }

      if (clamped !== targetPageRef.current) {
        targetPageRef.current = clamped;
        setTargetPage(clamped);
        clearTimeout(syncTimerRef.current);
      }

      scrollToPage(target, scrollContainer, toolbarHeight);
    },
    [doc, scrollContainerRef, scrollToPage, toolbarHeight],
  );

  const handlePreviousPage = useCallback(() => {
    const page = targetPageRef.current;

    if (page === null || page <= 1) {
      return;
    }

    navigateToPage(page - 1);
  }, [navigateToPage]);

  const handleNextPage = useCallback(() => {
    const page = targetPageRef.current;

    if (page === null || doc === null || page >= doc.pageCount) {
      return;
    }

    navigateToPage(page + 1);
  }, [navigateToPage, doc]);

  const handleRegisterElement = useCallback(
    (pageNumber: number, el: HTMLDivElement | null) => {
      if (el === null) {
        pageElementsRef.current.delete(pageNumber);
      } else {
        pageElementsRef.current.set(pageNumber, el);
      }

      setPageElement(pageNumber, el);
    },
    [setPageElement],
  );

  const handleOcrDetected = useCallback(() => setHasOcr(true), []);

  // Error state
  const displayError = error ?? (engineError !== null ? engineError.message : null) ?? docError;

  if (displayError !== null && displayError !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={fetching}
        refresh={refresh}
        heading="Feil ved lasting av PDF"
        errorMessage={displayError}
        documentNavigation={documentNavigation}
      />
    );
  }

  // Password prompt state
  const isPasswordPromptVisible = passwordState.status !== PasswordStatus.NONE && doc === null && !autoTryingPasswords;

  if (isPasswordPromptVisible) {
    return (
      <>
        <FileHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTabUrl={file.newTabUrl}
          downloadUrl={file.downloadUrl}
          variant={headerVariant}
          showPasswordIndicator
          isLoading={fetching}
          refresh={refresh}
          documentNavigation={documentNavigation}
        />

        <PasswordProtectedInfoCard />

        <PasswordPrompt passwordState={passwordState} onSubmitPassword={submitPassword} scale={scale} />
      </>
    );
  }

  // Loading state
  const isLoading = loading || engineLoading || docLoading;

  if (doc === null || engine === null) {
    return (
      <>
        <FileHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTabUrl={file.newTabUrl}
          downloadUrl={file.downloadUrl}
          variant={headerVariant}
          isLoading={isLoading || fetching}
          refresh={refresh}
          documentNavigation={documentNavigation}
        />

        <PlaceholderWrapper scale={scale}>
          <Loader size="3xlarge" />
          <BodyShort>{engineLoading ? 'Laster PDF-motor ...' : 'Laster PDF ...'}</BodyShort>
        </PlaceholderWrapper>
      </>
    );
  }

  const numPages = doc.pageCount;
  const previousPageDisabled = targetPage === null || targetPage <= 1;
  const nextPageDisabled = targetPage === null || targetPage >= numPages;

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={currentPage}
        numPages={numPages}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        onPrint={handlePrint}
        variant={headerVariant}
        showPasswordIndicator={usedPassword !== null}
        showOcrIndicator={hasOcr}
        isLoading={fetching}
        refresh={refresh}
        onPreviousPage={numPages > 1 ? handlePreviousPage : undefined}
        onNextPage={numPages > 1 ? handleNextPage : undefined}
        previousPageDisabled={previousPageDisabled}
        nextPageDisabled={nextPageDisabled}
        documentNavigation={documentNavigation}
      />

      {usedPassword !== null ? <PasswordProtectedInfoCard password={usedPassword} /> : null}

      <div
        ref={copyTargetRef}
        aria-hidden
        tabIndex={-1}
        style={{
          position: 'absolute',
          top: -9999,
          left: -9999,
          width: 1,
          height: 1,
          overflow: 'hidden',
          whiteSpace: 'pre',
        }}
      />

      <VStack
        position="relative"
        align="center"
        gap="space-16"
        width="100%"
        data-klage-file-viewer-document-pages={numPages}
      >
        {doc.pages.map((_page, pageIndex) => (
          <PdfPage
            // biome-ignore lint/suspicious/noArrayIndexKey: Pages are static once loaded and never reorder
            key={pageIndex}
            engine={engine}
            doc={doc}
            pageIndex={pageIndex}
            scale={scale}
            rotation={rotations.get(pageIndex) ?? 0}
            visible={visiblePages.has(pageIndex + 1)}
            highlights={highlightsByPage?.get(pageIndex + 1)}
            currentMatchIndex={currentMatchIndex}
            onRotate={handleRotate}
            onRegisterElement={handleRegisterElement}
            selectionRange={getPageSelectionRange(pageIndex)}
            isSelecting={isSelecting}
            clearSelection={clearSelection}
            onMouseDown={handleMouseDown}
            geometryRegistry={geometryRegistry}
            showPasswordOverlay={usedPassword !== null}
            onOcrDetected={handleOcrDetected}
          />
        ))}
      </VStack>
    </>
  );
};
