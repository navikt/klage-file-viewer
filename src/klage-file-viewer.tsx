import { Box, VStack } from '@navikt/ds-react';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FileViewerProvider, type KlageFileViewerProviderProps, useFileViewerConfig } from '@/context';
import type { DocumentNavigation } from '@/file-header/file-header';
import { FileSection } from '@/file-section';
import type { HighlightRect, PageHighlights } from '@/files/pdf/search/types';
import { useInitialScale } from '@/hooks/use-initial-scale';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useLazyLoading } from '@/hooks/use-lazy-loading';
import { RefreshRegistryProvider, useRefreshRegistry } from '@/hooks/use-refresh-registry';
import { useSectionVisibility } from '@/hooks/use-section-visibility';
import { Toolbar } from '@/toolbar/toolbar';
import { ToolbarHeightProvider, useToolbarHeight } from '@/toolbar-height-context';
import type { FileEntry, FileType, FileVariants } from '@/types';

export interface KlageFileViewerHandle {
  /** Moves focus to the scroll container. */
  focus: () => void;
  /** Re-fetches the file with the given URL. Resolves to `true` if a matching file was found and reload was triggered. */
  reloadFile: (url: string) => Promise<boolean>;
  /** Re-fetches all currently loaded files. Resolves to the number of refreshes triggered. */
  reloadAll: () => Promise<number>;
}

export interface KlageFileViewerProps extends KlageFileViewerInnerProps, KlageFileViewerProviderProps {}

const PADDING = 16;

export const KlageFileViewer = ({
  files,
  workerSrc,
  onClose,
  newTabUrl,
  theme,
  className,
  handleRef,
  ...config
}: KlageFileViewerProps) => {
  const toolbarRef = useRef<HTMLDivElement>(null);

  return (
    <FileViewerProvider {...config} theme={theme}>
      <RefreshRegistryProvider>
        <ToolbarHeightProvider toolbarRef={toolbarRef}>
          <KlageFileViewerInner
            files={files}
            workerSrc={workerSrc}
            onClose={onClose}
            newTabUrl={newTabUrl}
            handleRef={handleRef}
            className={className === undefined ? 'klage-file-viewer' : `klage-file-viewer ${className}`}
            toolbarRef={toolbarRef}
          />
        </ToolbarHeightProvider>
      </RefreshRegistryProvider>
    </FileViewerProvider>
  );
};

interface KlageFileViewerInnerProps {
  /** List of files to render in sequence */
  files: FileEntry[];
  /** URL to the PDF.js worker script. Required when any file has `variants` resolving to `PDF`. */
  workerSrc?: string;
  /** Shows close button when provided — called when the user clicks the close button */
  onClose?: () => void;
  /** When provided, shows a link in the toolbar to open the entire document set in a new tab */
  newTabUrl?: string | null;
  /** External ref exposing a handle with a `focus()` method. */
  handleRef?: Ref<KlageFileViewerHandle>;
  className?: string;
}

interface InternalRefs {
  toolbarRef: React.Ref<HTMLDivElement>;
}

const KlageFileViewerInner = ({
  files,
  workerSrc,
  onClose,
  newTabUrl,
  handleRef,
  className,
  toolbarRef,
}: KlageFileViewerInnerProps & InternalRefs) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { reloadFile, reloadAll } = useRefreshRegistry();

  const [searchHighlights, setSearchHighlights] = useState<PageHighlights[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { standalone } = useFileViewerConfig();
  const toolbarHeight = useToolbarHeight();

  const { scale, setScale } = useInitialScale(scrollContainerRef, standalone, toolbarHeight);

  useImperativeHandle(handleRef, () => ({
    focus: () => scrollContainerRef.current?.focus(),
    reloadFile,
    reloadAll,
  }));

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const hasPdfs = files.some((file) => containsFileType(file.variants, 'PDF'));

  // Configure PDF.js worker when PDF files are present (idempotent — safe to call on every render).
  useEffect(() => {
    if (hasPdfs && workerSrc !== undefined) {
      GlobalWorkerOptions.workerSrc = workerSrc;
    }
  }, [hasPdfs, workerSrc]);

  const isSinglePdf = files.length === 1 && files[0] !== undefined && getInitialFileType(files[0].variants) === 'PDF';

  const { loadedSectionCount, handlePageCountReady } = useLazyLoading({
    sectionCount: files.length,
    scrollContainerRef,
  });

  const {
    currentDocumentIndex,
    targetDocumentIndex,
    setSectionRef,
    navigateToSection,
    navigateToPreviousSection,
    navigateToNextSection,
  } = useSectionVisibility({
    sectionCount: files.length,
    scrollContainerRef,
  });

  const onPreviousDocument = files.length > 1 ? navigateToPreviousSection : undefined;
  const onNextDocument = files.length > 1 ? navigateToNextSection : undefined;
  const previousDocumentDisabled = targetDocumentIndex <= 0;
  const nextDocumentDisabled = targetDocumentIndex >= files.length - 1;

  const documentNavigations = useMemo(
    () =>
      files.map<DocumentNavigation | undefined>((_file, index) => {
        if (files.length <= 1) {
          return undefined;
        }

        return {
          goToPreviousDocument: index > 0 ? () => navigateToSection(index - 1, 'end') : undefined,
          goToNextDocument: index < files.length - 1 ? () => navigateToSection(index + 1) : undefined,
        };
      }),
    [files, navigateToSection],
  );

  const { handleKeyDown } = useKeyboardShortcuts({
    scrollContainerRef,
    setScale,
    isSinglePdf,
    onOpenSearch: () => {
      setIsSearchOpen(true);
      searchInputRef.current?.focus();
    },
    onPreviousDocument,
    onNextDocument,
    previousDocumentDisabled,
    nextDocumentDisabled,
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
    <Box
      as="section"
      background="neutral-softA"
      shadow="dialog"
      borderRadius="4"
      position="relative"
      width="100%"
      height="100%"
      flexGrow="1"
      overflowX="clip"
      overflowY="auto"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={className}
      ref={scrollContainerRef}
      data-klage-file-viewer
    >
      <VStack width="100%" overflow="clip" className="outline-ax-accent-500 focus-within:outline">
        <Toolbar
          ref={toolbarRef}
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
          newTabUrl={newTabUrl}
          onPreviousDocument={onPreviousDocument}
          onNextDocument={onNextDocument}
          previousDocumentDisabled={previousDocumentDisabled}
          nextDocumentDisabled={nextDocumentDisabled}
        />

        {/* Scrollable container with all file sections */}
        <VStack
          align="center"
          overflow="clip"
          position="relative"
          flexGrow="1"
          gap="space-16"
          width="100%"
          tabIndex={0}
          className="focus:outline-none"
        >
          {files.map((file, index) => (
            <VStack
              key={file.url}
              data-klage-file-viewer-section-index={index}
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
                documentNavigation={documentNavigations[index]}
              />
            </VStack>
          ))}
        </VStack>
      </VStack>
    </Box>
  );
};

const containsFileType = (variants: FileVariants, fileType: FileType): boolean => {
  if (typeof variants === 'string') {
    return variants === fileType;
  }

  if (Array.isArray(variants)) {
    return variants.some(({ filtype }) => filtype === fileType);
  }

  return variants.filtype === fileType;
};

const getInitialFileType = (variants: FileVariants): FileType => {
  if (typeof variants === 'string') {
    return variants;
  }

  if (Array.isArray(variants)) {
    const redactedVariant = variants.find(({ format }) => format === 'SLADDET');

    return (redactedVariant ?? variants[0]).filtype;
  }

  return variants.filtype;
};
