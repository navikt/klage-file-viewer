import { ArrowsCirclepathIcon } from '@navikt/aksel-icons';
import { Alert, BodyShort, Button, Heading, HStack, Loader, VStack } from '@navikt/ds-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileViewerConfig } from '@/context';
import { ExcelTable } from '@/excel/excel-table';
import { useExcelData } from '@/excel/use-excel-data';
import { getPageScrollTop, scrollToPage } from '@/lib/page-scroll';
import { getA4Dimensions } from '@/pdf/pdf-section-placeholder';
import { StickyHeader } from '@/sticky-header';
import type { ExcelFileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

/**
 * Check whether the scroll container has been scrolled to (or past) the
 * reading position for the given sheet element.
 */
const hasReachedSheet = (sheetElement: HTMLElement, scrollContainer: HTMLElement): boolean =>
  scrollContainer.scrollTop >= getPageScrollTop(sheetElement, scrollContainer) - 1;

/**
 * Check whether the scroll container has been scrolled completely past the
 * given sheet element (the sheet is entirely above the viewport).
 */
const hasPassedSheet = (sheetElement: HTMLElement, scrollContainer: HTMLElement): boolean =>
  scrollContainer.scrollTop > getPageScrollTop(sheetElement, scrollContainer) + sheetElement.offsetHeight;

interface LoadedExcelSectionProps {
  file: ExcelFileEntry;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onPageCountReady: (pageCount: number) => void;
  /** URL to the Excel web worker script. Required for parsing Excel files. */
  excelWorkerSrc?: string;
}

export const LoadedExcelSection = ({
  file,
  scale,
  scrollContainerRef,
  onPageCountReady,
  excelWorkerSrc,
}: LoadedExcelSectionProps) => {
  const { errorComponent: ErrorComponent } = useFileViewerConfig();
  const { data, loading, error, refresh } = useFileData(file.url, file.query);
  const { sheets, parsing, parseError } = useExcelData(data, excelWorkerSrc);
  const [currentSheet, setCurrentSheet] = useState(1);
  const sheetRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const isLoading = loading || parsing;
  const numSheets = sheets.length;

  // --- track the most-visible sheet within this section ---
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null || numSheets === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let maxVisibility = 0;
        let mostVisibleSheet = currentSheet;

        for (const entry of entries) {
          const sheetNumber = Number.parseInt(entry.target.getAttribute('data-page-number') ?? '1', 10);

          if (entry.intersectionRatio > maxVisibility) {
            maxVisibility = entry.intersectionRatio;
            mostVisibleSheet = sheetNumber;
          }
        }

        if (maxVisibility > 0) {
          setCurrentSheet(mostVisibleSheet);
        }
      },
      {
        root: scrollContainer,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const ref of sheetRefs.current.values()) {
      observer.observe(ref);
    }

    return () => observer.disconnect();
  }, [numSheets, currentSheet, scrollContainerRef]);

  // --- sheet navigation with stable target tracking ---
  const [targetSheet, setTargetSheet] = useState(currentSheet);
  const targetSheetRef = useRef(currentSheet);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced sync: after scrolling settles, align targetSheet with currentSheet.
  useEffect(() => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      targetSheetRef.current = currentSheet;
      setTargetSheet(currentSheet);
    }, 150);

    return () => clearTimeout(syncTimerRef.current);
  }, [currentSheet]);

  const navigateToSheet = useCallback(
    (sheet: number) => {
      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null) {
        return;
      }

      const clamped = Math.max(1, Math.min(sheet, numSheets));
      const sheetElement = sheetRefs.current.get(clamped);

      if (sheetElement === undefined) {
        return;
      }

      const desiredTop = getPageScrollTop(sheetElement, scrollContainer);

      if (clamped === targetSheetRef.current && Math.abs(scrollContainer.scrollTop - desiredTop) < 1) {
        return;
      }

      if (clamped !== targetSheetRef.current) {
        targetSheetRef.current = clamped;
        setTargetSheet(clamped);
        clearTimeout(syncTimerRef.current);
      }

      scrollToPage(sheetElement, scrollContainer, { behavior: 'smooth' });
    },
    [numSheets, scrollContainerRef],
  );

  const onPreviousPage =
    numSheets === 0
      ? undefined
      : () => {
          const target = targetSheetRef.current;
          const scrollContainer = scrollContainerRef.current;
          const sheetElement = sheetRefs.current.get(target);

          const scrollToTarget =
            scrollContainer !== null && sheetElement !== undefined && hasPassedSheet(sheetElement, scrollContainer);

          navigateToSheet(scrollToTarget ? target : target - 1);
        };

  const onNextPage =
    numSheets === 0
      ? undefined
      : () => {
          const target = targetSheetRef.current;
          const scrollContainer = scrollContainerRef.current;
          const sheetElement = sheetRefs.current.get(target);

          const scrollToTarget =
            scrollContainer !== null && sheetElement !== undefined && !hasReachedSheet(sheetElement, scrollContainer);

          navigateToSheet(scrollToTarget ? target : target + 1);
        };

  const previousPageDisabled = targetSheet <= 1;
  const nextPageDisabled = targetSheet >= numSheets;

  const setSheetRef = useCallback((sheetNumber: number, element: HTMLDivElement | null) => {
    if (element === null) {
      sheetRefs.current.delete(sheetNumber);
    } else {
      sheetRefs.current.set(sheetNumber, element);
    }
  }, []);

  // --- report sheet count to parent for lazy-loading coordination ---
  useEffect(() => {
    if (numSheets > 0) {
      onPageCountReady(numSheets);
    }
  }, [numSheets, onPageCountReady]);

  if (error !== undefined) {
    return (
      <>
        <StickyHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTab={file.newTab}
          downloadUrl={file.downloadUrl}
          headerExtra={file.headerExtra}
          isLoading={isLoading}
          refresh={refresh}
        />

        <div className="w-full grow p-5">
          <Alert variant="error" size="small">
            <HStack gap="space-16" align="center">
              <Heading size="small">Feil ved lasting av Excel-fil</Heading>
              {ErrorComponent !== undefined ? <ErrorComponent refresh={refresh} /> : null}
              <Button
                data-color="neutral"
                variant="secondary"
                size="small"
                icon={<ArrowsCirclepathIcon aria-hidden />}
                onClick={refresh}
              >
                Last fil på nytt
              </Button>
              <code className="border-2 border-ax-border-neutral bg-ax-bg-neutral-moderate p-2 text-xs">{error}</code>
            </HStack>
          </Alert>
        </div>
      </>
    );
  }

  if (parseError !== undefined) {
    return (
      <>
        <StickyHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTab={file.newTab}
          downloadUrl={file.downloadUrl}
          headerExtra={file.headerExtra}
          isLoading={isLoading}
          refresh={refresh}
        />

        <div className="w-full grow p-5">
          <Alert variant="error" size="small">
            <HStack gap="space-16" align="center">
              <Heading size="small">Feil ved lesing av Excel-fil</Heading>
              <Button
                data-color="neutral"
                variant="secondary"
                size="small"
                icon={<ArrowsCirclepathIcon aria-hidden />}
                onClick={refresh}
              >
                Last fil på nytt
              </Button>
              <code className="border-2 border-ax-border-neutral bg-ax-bg-neutral-moderate p-2 text-xs">
                {parseError}
              </code>
            </HStack>
          </Alert>
        </div>
      </>
    );
  }

  const { width, height } = getA4Dimensions(scale);

  if (isLoading || numSheets === 0) {
    return (
      <>
        <StickyHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTab={file.newTab}
          downloadUrl={file.downloadUrl}
          headerExtra={file.headerExtra}
          isLoading={isLoading}
          refresh={refresh}
        />

        <VStack
          align="center"
          justify="center"
          gap="space-16"
          className="bg-ax-bg-neutral-moderate/30 shadow-ax-dialog"
          style={{ width, minHeight: height }}
        >
          <Loader size="3xlarge" />
          <BodyShort>Leser Excel-fil …</BodyShort>
        </VStack>
      </>
    );
  }

  return (
    <>
      <StickyHeader
        title={file.title}
        currentPage={currentSheet}
        numPages={numSheets}
        newTab={file.newTab}
        downloadUrl={file.downloadUrl}
        headerExtra={file.headerExtra}
        isLoading={isLoading}
        refresh={refresh}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
        previousPageDisabled={previousPageDisabled}
        nextPageDisabled={nextPageDisabled}
      />

      <div className="relative flex w-full flex-col gap-4">
        {sheets.map((sheet, index) => {
          const sheetNumber = index + 1;

          return (
            <div
              key={sheet.name}
              data-page-number={sheetNumber}
              ref={(el) => {
                setSheetRef(sheetNumber, el);
              }}
              className="w-full"
            >
              <ExcelTable sheetName={sheet.name} rows={sheet.rows} />
            </div>
          );
        })}
      </div>
    </>
  );
};
