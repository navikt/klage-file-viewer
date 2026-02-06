import { Box, Theme, VStack } from '@navikt/ds-react';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_SCALE } from '@/constants';
import { FileViewerProvider, type KlageFileViewerConfig } from '@/context';
import { FileSection } from '@/file-section';
import { useLazyLoading } from '@/hooks/use-lazy-loading';
import { useSectionVisibility } from '@/hooks/use-section-visibility';
import { useZoom } from '@/hooks/use-zoom';
import { MainToolbar } from '@/main-toolbar';
import type { HighlightRect, PageHighlights } from '@/pdf/search/types';
import type { FileEntry, NewTabProps } from '@/types';

export type { KlageFileViewerConfig as FileViewerConfig } from '@/context';
export type { ExcelFileEntry, FileEntry, NewTabProps, PdfFileEntry } from '@/types';

export interface KlageFileViewerProps extends KlageFileViewerInnerProps, Partial<KlageFileViewerConfig> {
  className?: string;
  theme: 'light' | 'dark';
}

const PADDING = 16;

export const KlageFileViewer = ({
  files,
  workerSrc,
  excelWorkerSrc,
  onClose,
  newTab,
  theme,
  className,
  ...config
}: KlageFileViewerProps) => {
  return (
    <Theme theme={theme} className={className === undefined ? 'klage-file-viewer' : `klage-file-viewer ${className}`}>
      <FileViewerProvider {...config} theme={theme}>
        <KlageFileViewerInner
          files={files}
          workerSrc={workerSrc}
          excelWorkerSrc={excelWorkerSrc}
          onClose={onClose}
          newTab={newTab}
        />
      </FileViewerProvider>
    </Theme>
  );
};

interface KlageFileViewerInnerProps {
  /** List of files to render in sequence */
  files: FileEntry[];
  /** URL to the PDF.js worker script. Required when any file has `type: 'pdf'`. */
  workerSrc?: string;
  /** URL to the Excel web worker script. Required when any file has `type: 'excel'`. */
  excelWorkerSrc?: string;
  /** Shows close button when provided — called when the user clicks the close button */
  onClose?: () => void;
  /** When provided, shows a link in the toolbar to open the entire document set in a new tab */
  newTab?: NewTabProps | null;
}

const KlageFileViewerInner = ({ files, workerSrc, excelWorkerSrc, onClose, newTab }: KlageFileViewerInnerProps) => {
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [searchHighlights, setSearchHighlights] = useState<PageHighlights[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const hasPdfs = files.some((file) => file.type === 'pdf');

  // Configure PDF.js worker when PDF files are present (idempotent — safe to call on every render).
  useEffect(() => {
    if (hasPdfs && workerSrc !== undefined) {
      GlobalWorkerOptions.workerSrc = workerSrc;
    }
  }, [hasPdfs, workerSrc]);

  const isSinglePdf = files.length === 1 && files[0]?.type === 'pdf';

  const { loadedSectionCount, handlePageCountReady } = useLazyLoading({
    sectionCount: files.length,
    scrollContainerRef,
  });

  const { currentDocumentIndex, targetDocumentIndex, setSectionRef, navigateToPreviousSection, navigateToNextSection } =
    useSectionVisibility({
      sectionCount: files.length,
      scrollContainerRef,
    });

  const onPreviousDocument = files.length > 1 ? navigateToPreviousSection : undefined;
  const onNextDocument = files.length > 1 ? navigateToNextSection : undefined;
  const previousDocumentDisabled = targetDocumentIndex <= 0;
  const nextDocumentDisabled = targetDocumentIndex >= files.length - 1;

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
    <VStack
      asChild
      width="100%"
      height="100%"
      flexGrow="1"
      align="center"
      justify="center"
      overflow="clip"
      data-klage-file-viewer-inner
    >
      <Box as="section" background="default" shadow="dialog" borderRadius="4" position="relative">
        <VStack
          ref={containerRef}
          width="100%"
          height="100%"
          overflow="clip"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="outline-ax-accent-500 focus-within:outline"
        >
          <MainToolbar
            scale={scale}
            setScale={setScale}
            scrollContainerRef={scrollContainerRef}
            isSinglePdf={isSinglePdf}
            isSearchOpen={isSearchOpen}
            setIsSearchOpen={setIsSearchOpen}
            pageRefs={pageRefs}
            onHighlightsChange={setSearchHighlights}
            currentMatchIndex={currentMatchIndex}
            onCurrentMatchIndexChange={setCurrentMatchIndex}
            searchInputRef={searchInputRef}
            currentDocumentIndex={currentDocumentIndex}
            totalDocuments={files.length}
            onClose={onClose}
            newTab={newTab}
            onPreviousDocument={onPreviousDocument}
            onNextDocument={onNextDocument}
            previousDocumentDisabled={previousDocumentDisabled}
            nextDocumentDisabled={nextDocumentDisabled}
          />

          {/* ---- scrollable container with all file sections ---- */}
          <VStack
            ref={scrollContainerRef}
            align="center"
            overflowY="auto"
            overflowX="clip"
            position="relative"
            flexGrow="1"
            gap="space-16"
            width="100%"
          >
            {files.map((file, index) => (
              <VStack
                key={file.url}
                data-section-index={index}
                ref={(el) => setSectionRef(index, el)}
                padding={`space-${PADDING}`}
                width="100%"
                align="center"
                data-klage-file-viewer-document={file.title}
              >
                <FileSection
                  file={file}
                  scale={scale}
                  scrollContainerRef={scrollContainerRef}
                  shouldLoad={index < loadedSectionCount}
                  onPageCountReady={(pageCount) => handlePageCountReady(index, pageCount)}
                  setPageRef={isSinglePdf ? setPageRef : undefined}
                  highlightsByPage={isSinglePdf ? highlightsByPage : undefined}
                  currentMatchIndex={isSinglePdf ? currentMatchIndex : undefined}
                  excelWorkerSrc={excelWorkerSrc}
                />
              </VStack>
            ))}
          </VStack>
        </VStack>
      </Box>
    </VStack>
  );
};
