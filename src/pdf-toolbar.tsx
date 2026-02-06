import { XMarkIcon } from '@navikt/aksel-icons';
import { Button, HStack, Tag, Tooltip } from '@navikt/ds-react';
import { FitHeight } from './fit-height';
import { Scale } from './scale';
import { PdfSearch } from './search/pdf-search';
import type { PageHighlights } from './search/types';
import type { RotationDegrees } from './types';

interface PdfToolbarProps {
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  padding: number;
  isSinglePdf: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pageRefs: React.RefObject<Map<number, HTMLDivElement>>;
  onHighlightsChange: (highlights: PageHighlights[]) => void;
  currentMatchIndex: number;
  onCurrentMatchIndexChange: (index: number) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  currentDocumentIndex: number;
  totalDocuments: number;
  onClose?: () => void;
}

export const PdfToolbar = ({
  scale,
  setScale,
  scrollContainerRef,
  padding,
  isSinglePdf,
  isSearchOpen,
  setIsSearchOpen,
  pageRefs,
  onHighlightsChange,
  currentMatchIndex,
  onCurrentMatchIndexChange,
  searchInputRef,
  currentDocumentIndex,
  totalDocuments,
  onClose,
}: PdfToolbarProps) => (
  <HStack
    flexShrink="0"
    align="center"
    justify="space-between"
    padding="space-8"
    wrap={false}
    className="border-ax-border-neutral border-b bg-ax-bg-neutral-moderate"
  >
    <HStack gap="space-4" align="center" wrap={false}>
      {onClose !== undefined ? (
        <Tooltip content="Lukk dokumentet" describesChild>
          <Button
            onClick={onClose}
            icon={<XMarkIcon aria-hidden />}
            size="xsmall"
            variant="tertiary"
            data-color="neutral"
          />
        </Tooltip>
      ) : null}

      <Scale scale={scale} setScale={setScale} />

      <FitHeight scrollContainerRef={scrollContainerRef} scale={scale} padding={padding} onFitToHeight={setScale} />

      {isSinglePdf ? (
        <PdfSearch
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          pageRefs={pageRefs}
          onHighlightsChange={onHighlightsChange}
          currentMatchIndex={currentMatchIndex}
          onCurrentMatchIndexChange={onCurrentMatchIndexChange}
          searchInputRef={searchInputRef}
          rotation={0 as RotationDegrees}
          scale={scale}
        />
      ) : null}
    </HStack>

    {totalDocuments > 1 ? (
      <Tag data-color="neutral" variant="outline" size="xsmall">
        {`Dokument ${(currentDocumentIndex + 1).toString(10)} av ${totalDocuments.toString(10)}`}
      </Tag>
    ) : null}
  </HStack>
);
