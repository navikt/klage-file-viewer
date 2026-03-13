import { Box, VStack } from '@navikt/ds-react';
import { type Ref, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FileViewerProvider, type KlageFileViewerProviderProps, useFileViewerConfig } from '@/context';
import type { DocumentNavigation } from '@/file-header/file-header';
import { FileSection } from '@/file-section';
import type { PdfSectionSearchInfo } from '@/files/pdf/loaded-pdf-section';
import { PdfEngineProvider } from '@/files/pdf/pdf-engine-context';
import type { SearchableDocument } from '@/files/pdf/search/search';
import type { HighlightRect, PageHighlights } from '@/files/pdf/search/types';
import { useInitialScale } from '@/hooks/use-initial-scale';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useLazyLoading } from '@/hooks/use-lazy-loading';
import { RefreshRegistryProvider, useRefreshRegistry } from '@/hooks/use-refresh-registry';
import { useSectionVisibility } from '@/hooks/use-section-visibility';
import { Toolbar } from '@/toolbar/toolbar';
import { ToolbarHeightProvider, useToolbarHeight } from '@/toolbar-height-context';
import type { FileEntry } from '@/types';

declare const __PDFIUM_WASM_HASH__: string;

const DEFAULT_PDFIUM_WASM_URL =
  __PDFIUM_WASM_HASH__.length === 0
    ? 'https://cdn.nav.no/klage/klage-file-viewer/pdfium/pdfium.wasm'
    : `https://cdn.nav.no/klage/klage-file-viewer/pdfium/pdfium-${__PDFIUM_WASM_HASH__}.wasm`;

export interface KlageFileViewerHandle {
  /** Moves focus to the scroll container. */
  focus: () => void;
  /** Re-fetches the file with the given URL. Resolves to `true` if a matching file was found and reload was triggered. */
  reloadFile: (url: string) => Promise<boolean>;
  /** Re-fetches all currently loaded files. Resolves to the number of refreshes triggered. */
  reloadAll: () => Promise<number>;
}

export interface KlageFileViewerProps
  extends Omit<KlageFileViewerInnerProps, 'toolbarRef'>,
    KlageFileViewerProviderProps {
  /** URL to the PDFium WASM binary. Defaults to the Nav CDN-hosted version. */
  pdfiumWasmUrl?: string;
}

const PADDING = 16;

export const KlageFileViewer = ({
  files,
  onClose,
  newTabUrl,
  theme,
  className,
  handleRef,
  pdfiumWasmUrl = DEFAULT_PDFIUM_WASM_URL,
  ...config
}: KlageFileViewerProps) => {
  const toolbarRef = useRef<HTMLDivElement>(null);

  return (
    <FileViewerProvider {...config} theme={theme}>
      <RefreshRegistryProvider>
        <PdfEngineProvider pdfiumWasmUrl={pdfiumWasmUrl}>
          <ToolbarHeightProvider toolbarRef={toolbarRef}>
            <KlageFileViewerInner
              files={files}
              onClose={onClose}
              newTabUrl={newTabUrl}
              handleRef={handleRef}
              className={className === undefined ? 'klage-file-viewer' : `klage-file-viewer ${className}`}
              toolbarRef={toolbarRef}
            />
          </ToolbarHeightProvider>
        </PdfEngineProvider>
      </RefreshRegistryProvider>
    </FileViewerProvider>
  );
};

interface KlageFileViewerInnerProps {
  /** List of files to render in sequence */
  files: FileEntry[];
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

  const [pdfSearchInfoMap, setPdfSearchInfoMap] = useState<Map<number, PdfSectionSearchInfo>>(() => new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { loadedSectionCount, sectionPageCounts, handlePageCountReady } = useLazyLoading({
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
    onOpenSearch: () => {
      setIsSearchOpen(true);
      searchInputRef.current?.focus();
    },
    onPreviousDocument,
    onNextDocument,
    previousDocumentDisabled,
    nextDocumentDisabled,
  });

  const searchDocuments = useMemo<SearchableDocument[]>(() => {
    const docs: SearchableDocument[] = [];

    // Build sorted list of section indices that have search info
    const sortedIndices = Array.from(pdfSearchInfoMap.keys()).sort((a, b) => a - b);

    for (const sectionIndex of sortedIndices) {
      const info = pdfSearchInfoMap.get(sectionIndex);

      if (info === undefined) {
        continue;
      }

      // Compute page number offset: sum of page counts from all preceding sections
      let pageNumberOffset = 0;

      for (let i = 0; i < sectionIndex; i++) {
        pageNumberOffset += sectionPageCounts.get(i) ?? 0;
      }

      docs.push({
        engine: info.engine,
        doc: info.doc,
        pageNumberOffset,
        scale,
        rotations: info.rotations,
      });
    }

    return docs;
  }, [pdfSearchInfoMap, sectionPageCounts, scale]);

  const sectionPageOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cumulative = 0;

    for (let i = 0; i < files.length; i++) {
      offsets.push(cumulative);
      cumulative += sectionPageCounts.get(i) ?? 0;
    }

    return offsets;
  }, [files.length, sectionPageCounts]);

  const highlightsBySection = useMemo(() => {
    const globalMap = new Map<number, HighlightRect[]>();

    for (const { pageNumber, highlights } of searchHighlights) {
      globalMap.set(pageNumber, highlights);
    }

    return files.map((_file, index) => {
      const offset = sectionPageOffsets[index] ?? 0;
      const pageCount = sectionPageCounts.get(index) ?? 0;
      const localMap = new Map<number, HighlightRect[]>();

      for (let localPage = 1; localPage <= pageCount; localPage++) {
        const globalPage = offset + localPage;
        const highlights = globalMap.get(globalPage);

        if (highlights !== undefined) {
          localMap.set(localPage, highlights);
        }
      }

      return localMap;
    });
  }, [searchHighlights, files, sectionPageOffsets, sectionPageCounts]);

  const searchableReadyCallbacks = useMemo(
    () =>
      files.map((_file, index) => (info: PdfSectionSearchInfo | null) => {
        setPdfSearchInfoMap((prev) => {
          const next = new Map(prev);

          if (info === null) {
            next.delete(index);
          } else {
            next.set(index, info);
          }

          return next;
        });
      }),
    [files],
  );

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
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          searchDocuments={searchDocuments}
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
                onSearchableReady={searchableReadyCallbacks[index]}
                highlightsByPage={highlightsBySection[index]}
                currentMatchIndex={currentMatchIndex}
                documentNavigation={documentNavigations[index]}
              />
            </VStack>
          ))}
        </VStack>
      </VStack>
    </Box>
  );
};
