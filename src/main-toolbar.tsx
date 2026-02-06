import { ChevronDownIcon, ChevronUpIcon, CogIcon, XMarkIcon } from '@navikt/aksel-icons';
import { Button, HStack, Tag, Tooltip } from '@navikt/ds-react';
import { useState } from 'react';
import { FitHeight } from '@/fit-height';
import { NewTabButton } from '@/new-tab-button';
import { PdfSearch } from '@/pdf/search/pdf-search';
import type { PageHighlights } from '@/pdf/search/types';
import { Scale } from '@/scale';
import { SettingsModal } from '@/settings-modal';
import type { NewTabProps, RotationDegrees } from '@/types';

interface MainToolbarProps {
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
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
  newTab?: NewTabProps | null;
  onPreviousDocument?: () => void;
  onNextDocument?: () => void;
  previousDocumentDisabled?: boolean;
  nextDocumentDisabled?: boolean;
}

export const MainToolbar = ({
  scale,
  setScale,
  scrollContainerRef,
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
  newTab = null,
  onPreviousDocument,
  onNextDocument,
  previousDocumentDisabled,
  nextDocumentDisabled,
}: MainToolbarProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <HStack
      flexShrink="0"
      align="center"
      justify="space-between"
      padding="space-8"
      wrap={false}
      className="border-ax-border-neutral border-b bg-ax-bg-neutral-moderate"
      width="100%"
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

        <FitHeight scrollContainerRef={scrollContainerRef} scale={scale} onFitToHeight={setScale} />

        {newTab !== null ? <NewTabButton {...newTab} tooltip="Åpne i ny fane" /> : null}

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

        <Tooltip content="Innstillinger" describesChild>
          <Button
            onClick={() => {
              setIsSettingsOpen(true);
            }}
            icon={<CogIcon aria-hidden />}
            size="xsmall"
            variant="tertiary"
            data-color="neutral"
          />
        </Tooltip>

        <SettingsModal
          open={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
          }}
        />
      </HStack>

      <HStack gap="space-4" align="center" wrap={false}>
        {onPreviousDocument !== undefined && totalDocuments > 1 ? (
          <Tooltip content="Forrige dokument" describesChild>
            <Button
              size="xsmall"
              variant="tertiary"
              data-color="neutral"
              icon={<ChevronUpIcon aria-hidden />}
              onClick={onPreviousDocument}
              disabled={previousDocumentDisabled === true}
            />
          </Tooltip>
        ) : null}

        {onNextDocument !== undefined && totalDocuments > 1 ? (
          <Tooltip content="Neste dokument" describesChild>
            <Button
              size="xsmall"
              variant="tertiary"
              data-color="neutral"
              icon={<ChevronDownIcon aria-hidden />}
              onClick={onNextDocument}
              disabled={nextDocumentDisabled === true}
            />
          </Tooltip>
        ) : null}

        <Tag data-color="neutral" variant="outline" size="xsmall">
          {`Dokument ${(currentDocumentIndex + 1).toString(10)} av ${totalDocuments.toString(10)}`}
        </Tag>
      </HStack>
    </HStack>
  );
};
