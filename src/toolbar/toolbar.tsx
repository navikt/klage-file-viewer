import { ChevronDownIcon, ChevronUpIcon, CogIcon, XMarkIcon } from '@navikt/aksel-icons';
import { Button, HStack, Tag, Tooltip } from '@navikt/ds-react';
import { useState } from 'react';
import { useFileViewerConfig } from '@/context';
import { PdfSearch } from '@/files/pdf/search/pdf-search';
import type { PageHighlights } from '@/files/pdf/search/types';
import { MOD_KEY_TEXT } from '@/lib/keys';
import { NewTabButton } from '@/new-tab-button';
import { DefaultScale } from '@/toolbar/default-scale';
import { FitHeight } from '@/toolbar/fit-height';
import { FitPage } from '@/toolbar/fit-page';
import { FitWidth } from '@/toolbar/fit-width';
import { Scale } from '@/toolbar/scale';
import { SettingsModal } from '@/toolbar/settings-modal';
import type { RotationDegrees } from '@/types';

interface ToolbarProps {
  ref?: React.Ref<HTMLDivElement>;
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
  newTabUrl?: string | null;
  onPreviousDocument?: () => void;
  onNextDocument?: () => void;
  previousDocumentDisabled?: boolean;
  nextDocumentDisabled?: boolean;
}

export const Toolbar = ({
  ref,
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
  newTabUrl = null,
  onPreviousDocument,
  onNextDocument,
  previousDocumentDisabled,
  nextDocumentDisabled,
}: ToolbarProps) => {
  const { standalone } = useFileViewerConfig();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <HStack
      flexShrink="0"
      align="center"
      justify="space-between"
      padding="space-8"
      wrap={false}
      className="z-30 border-ax-border-neutral border-b bg-ax-bg-neutral-moderate"
      width="100%"
      position="sticky"
      top="space-0"
      ref={ref}
    >
      <HStack gap="space-4" align="center" wrap={false}>
        <Scale scale={scale} setScale={setScale} />

        <Separator />

        {standalone ? <FitWidth scrollContainerRef={scrollContainerRef} scale={scale} onFitToWidth={setScale} /> : null}

        <FitHeight scrollContainerRef={scrollContainerRef} scale={scale} onFitToHeight={setScale} />

        {standalone ? <FitPage scrollContainerRef={scrollContainerRef} scale={scale} onFitToPage={setScale} /> : null}

        <DefaultScale scrollContainerRef={scrollContainerRef} onDefaultScale={setScale} />

        <Separator />

        {newTabUrl !== null ? <NewTabButton url={newTabUrl} tooltip="Åpne alle i ny fane" /> : null}

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
            scrollContainerRef={scrollContainerRef}
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
          <Tooltip content="Forrige dokument" keys={[MOD_KEY_TEXT, 'Shift', '↑']} describesChild>
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
          <Tooltip content="Neste dokument" keys={[MOD_KEY_TEXT, 'Shift', '↓']} describesChild>
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
      </HStack>
    </HStack>
  );
};

const Separator = () => <div className="mx-1 h-4 w-px bg-ax-border-neutral" role="presentation" aria-hidden />;
