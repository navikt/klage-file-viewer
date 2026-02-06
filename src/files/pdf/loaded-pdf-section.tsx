import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { useCallback, useEffect } from 'react';
import { useFileViewerConfig } from '@/context';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { FileErrorLayout } from '@/files/file-error-layout';
import { PagePlaceholder } from '@/files/pdf/page-placeholder';
import { PasswordPrompt } from '@/files/pdf/password-prompt';
import { PasswordProtectedInfoCard } from '@/files/pdf/password-protected-info-card';
import { getA4Dimensions, PlaceholderWrapper } from '@/files/pdf/pdf-section-placeholder';
import { RotatablePage } from '@/files/pdf/rotatable-page';
import type { HighlightRect } from '@/files/pdf/search/types';
import { PasswordStatus, usePdfDocument } from '@/files/pdf/use-pdf-document';
import { useRegisterRefresh } from '@/hooks/use-refresh-registry';
import { useVisiblePages } from '@/hooks/use-visible-pages';
import { usePageNavigation } from '@/lib/use-page-navigation';
import type { FileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

interface LoadedPdfSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onPageCountReady: (pageCount: number) => void;
  setPageRef?: (pageNumber: number, element: HTMLDivElement | null) => void;
  highlightsByPage?: Map<number, HighlightRect[]>;
  currentMatchIndex?: number;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const LoadedPdfSection = ({
  file,
  headerVariant,
  scale,
  scrollContainerRef,
  onPageCountReady,
  setPageRef,
  highlightsByPage,
  currentMatchIndex,
  documentNavigation,
}: LoadedPdfSectionProps) => {
  const { errorComponent: ErrorComponent, commonPasswords } = useFileViewerConfig();
  const { data, loading, fetching, error, refresh } = useFileData(file.url, file.query);

  useRegisterRefresh(file.url, refresh);

  const {
    pdfDocument,
    pages,
    passwordState,
    pdfError,
    usedPassword,
    autoTryingPasswords,
    loadedData,
    setSubmittedPassword,
  } = usePdfDocument({ data, commonPasswords, fileUrl: file.url });

  const { currentPage, onPreviousPage, onNextPage, previousPageDisabled, nextPageDisabled, setItemRef } =
    usePageNavigation(pages.length, scrollContainerRef);

  const { visiblePages, setPageElement } = useVisiblePages(scrollContainerRef, pages.length);

  const setInternalPageRef = useCallback(
    (pageNumber: number, element: HTMLDivElement | null) => {
      setItemRef(pageNumber, element);
      setPageRef?.(pageNumber, element);
    },
    [setItemRef, setPageRef],
  );

  // Report page count to parent for lazy-loading coordination
  useEffect(() => {
    if (pages.length > 0) {
      onPageCountReady(pages.length);
    } else if (error !== undefined || pdfError !== undefined) {
      onPageCountReady(0);
    }
  }, [pages.length, error, pdfError, onPageCountReady]);

  const displayError = error ?? pdfError;
  const pdfLoading = data !== null && data !== loadedData;
  const isLoaderVisible = loading || pdfLoading || autoTryingPasswords;
  const showLoadingOverlay = loadedData === null && isLoaderVisible;
  const isPasswordPromptVisible =
    passwordState.status !== PasswordStatus.NONE && pdfDocument === null && !autoTryingPasswords;

  // Error state (non-password errors)
  if (displayError !== undefined && displayError !== null && !isPasswordPromptVisible) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={fetching}
        refresh={refresh}
        heading="Feil ved lasting av PDF"
        errorMessage={displayError}
        ErrorComponent={ErrorComponent}
        documentNavigation={documentNavigation}
      />
    );
  }

  // Password prompt state
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

        <PasswordPrompt passwordState={passwordState} onSubmitPassword={setSubmittedPassword} scale={scale} />
      </>
    );
  }

  const numPages = pdfDocument?.numPages ?? null;
  const a4 = getA4Dimensions(scale);

  const pageContainerStyle: React.CSSProperties | undefined =
    pages.length === 0 ? { width: a4.width, minHeight: a4.height } : undefined;

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={currentPage}
        numPages={numPages}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        variant={headerVariant}
        showPasswordIndicator={usedPassword !== null}
        isLoading={fetching}
        refresh={refresh}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
        previousPageDisabled={previousPageDisabled}
        nextPageDisabled={nextPageDisabled}
        documentNavigation={documentNavigation}
      />

      {usedPassword !== null ? <PasswordProtectedInfoCard password={usedPassword} /> : null}

      <VStack
        position="relative"
        align="center"
        gap="space-16"
        width="100%"
        style={pageContainerStyle}
        data-klage-file-viewer-document-pages={pages.length}
      >
        {showLoadingOverlay && pages.length === 0 ? (
          <PlaceholderWrapper scale={scale}>
            <Loader size="3xlarge" />
            <BodyShort>{loading ? 'Laster PDF ...' : 'Tegner PDF ...'}</BodyShort>
          </PlaceholderWrapper>
        ) : null}

        {pages.map((page) => {
          const pageHighlights = highlightsByPage?.get(page.pageNumber);

          return (
            <div
              key={page.pageNumber}
              data-klage-file-viewer-page-number={page.pageNumber}
              data-klage-file-viewer-scalable
              ref={(el) => {
                setInternalPageRef(page.pageNumber, el);
                setPageElement(page.pageNumber, el);
              }}
              className="relative w-full overflow-x-auto"
            >
              {showLoadingOverlay ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-ax-bg-neutral-moderate/70 backdrop-blur-xs">
                  <VStack align="center" gap="space-8">
                    <Loader size="3xlarge" />
                    <BodyShort>{loading ? 'Laster PDF ...' : 'Tegner PDF ...'}</BodyShort>
                  </VStack>
                </div>
              ) : null}

              <div className="mx-auto w-fit">
                {visiblePages.has(page.pageNumber) ? (
                  <RotatablePage
                    page={page}
                    url={file.url}
                    scale={scale}
                    highlights={pageHighlights}
                    currentMatchIndex={currentMatchIndex}
                    showPasswordOverlay={usedPassword !== null}
                  />
                ) : (
                  <PagePlaceholder page={page} scale={scale} />
                )}
              </div>
            </div>
          );
        })}
      </VStack>
    </>
  );
};
