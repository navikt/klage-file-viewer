import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { useEffect } from 'react';
import { useFileViewerConfig } from '@/context';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { ExcelPlaceholderTable } from '@/files/excel/excel-placeholder-table';
import { ExcelTable } from '@/files/excel/excel-table';
import { useExcelData } from '@/files/excel/use-excel-data';
import { FileErrorLayout } from '@/files/file-error-layout';
import { useRegisterRefresh } from '@/hooks/use-refresh-registry';
import { usePageNavigation } from '@/lib/use-page-navigation';
import type { FileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

interface LoadedExcelSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onPageCountReady: (pageCount: number) => void;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const LoadedExcelSection = ({
  file,
  headerVariant,
  scrollContainerRef,
  onPageCountReady,
  documentNavigation,
}: LoadedExcelSectionProps) => {
  const { errorComponent: ErrorComponent } = useFileViewerConfig();
  const { data, loading, fetching, error, refresh } = useFileData(file.url, file.query);

  useRegisterRefresh(file.url, refresh);

  const { sheets, parsing, parseError } = useExcelData(data);

  const isHeaderLoading = fetching || parsing;
  const numSheets = sheets.length;
  const showLoadingOverlay = loading;

  const {
    currentPage: currentSheet,
    onPreviousPage,
    onNextPage,
    previousPageDisabled,
    nextPageDisabled,
    setItemRef: setSheetRef,
  } = usePageNavigation(numSheets, scrollContainerRef);

  // Report sheet count to parent for lazy-loading coordination
  useEffect(() => {
    if (numSheets > 0) {
      onPageCountReady(numSheets);
    } else if (error !== undefined || parseError !== undefined) {
      onPageCountReady(0);
    }
  }, [numSheets, error, parseError, onPageCountReady]);

  if (error !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={isHeaderLoading}
        refresh={refresh}
        heading="Feil ved lasting av Excel-fil"
        errorMessage={error}
        ErrorComponent={ErrorComponent}
        documentNavigation={documentNavigation}
      />
    );
  }

  if (parseError !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={isHeaderLoading}
        refresh={refresh}
        heading="Feil ved lesing av Excel-fil"
        errorMessage={parseError}
        documentNavigation={documentNavigation}
      />
    );
  }

  if (numSheets === 0) {
    return (
      <>
        <FileHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTabUrl={file.newTabUrl}
          downloadUrl={file.downloadUrl}
          variant={headerVariant}
          isLoading={isHeaderLoading}
          refresh={refresh}
          documentNavigation={documentNavigation}
        />

        <ExcelPlaceholderTable>
          <BodyShort>Leser Excel-fil …</BodyShort>
        </ExcelPlaceholderTable>
      </>
    );
  }

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={currentSheet}
        numPages={numSheets}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        variant={headerVariant}
        isLoading={isHeaderLoading}
        refresh={refresh}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
        previousPageDisabled={previousPageDisabled}
        nextPageDisabled={nextPageDisabled}
        documentNavigation={documentNavigation}
      />

      <div className="relative flex w-full flex-col gap-4">
        {sheets.map((sheet, index) => {
          const sheetNumber = index + 1;

          return (
            <div
              key={sheet.name}
              data-klage-file-viewer-page-number={sheetNumber}
              ref={(el) => {
                setSheetRef(sheetNumber, el);
              }}
              className="relative w-full"
            >
              {showLoadingOverlay ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-ax-bg-neutral-moderate/70 backdrop-blur-xs">
                  <VStack align="center" gap="space-8">
                    <Loader size="3xlarge" />
                    <BodyShort>Leser Excel-fil …</BodyShort>
                  </VStack>
                </div>
              ) : null}

              <ExcelTable sheetName={sheet.name} rows={sheet.rows} />
            </div>
          );
        })}
      </div>
    </>
  );
};
