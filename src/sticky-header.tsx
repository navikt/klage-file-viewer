import { ChevronDownIcon, ChevronUpIcon } from '@navikt/aksel-icons';
import { Box, Button, HStack, Tag, Tooltip } from '@navikt/ds-react';
import { DownloadButton } from '@/download-button';
import { NewTabButton } from '@/new-tab-button';
import { ReloadButton } from '@/reload-button';
import type { NewTabProps } from '@/types';

interface StickyHeaderProps {
  title: string;
  currentPage: number | null;
  numPages: number | null;
  newTab?: NewTabProps;
  downloadUrl?: string;
  headerExtra?: React.ReactNode;
  isLoading: boolean;
  refresh: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  previousPageDisabled?: boolean;
  nextPageDisabled?: boolean;
}

export const StickyHeader = ({
  title,
  currentPage,
  numPages,
  newTab,
  downloadUrl,
  headerExtra,
  isLoading,
  refresh,
  onPreviousPage,
  onNextPage,
  previousPageDisabled,
  nextPageDisabled,
}: StickyHeaderProps) => {
  const isPreviousDisabled = previousPageDisabled ?? (currentPage === null || currentPage <= 1);
  const isNextDisabled = nextPageDisabled ?? (currentPage === null || numPages === null || currentPage >= numPages);

  return (
    <HStack asChild align="center" justify="space-between" gap="space-4" width="100%" wrap={false}>
      <Box
        background="neutral-moderate"
        padding="space-8"
        className="sticky top-0 z-20"
        shadow="dialog"
        borderRadius="8"
        data-sticky-header
      >
        <HStack wrap={false} justify="start" align="center" gap="space-4" minWidth="0">
          <ReloadButton isLoading={isLoading} onClick={refresh} />

          <Tooltip content={title}>
            <h2 className="truncate font-ax-bold text-base">{title}</h2>
          </Tooltip>

          {newTab !== undefined ? (
            <NewTabButton url={newTab.url} id={newTab.id} tooltip="Åpne dokument i ny fane" />
          ) : null}

          {downloadUrl !== undefined ? <DownloadButton url={downloadUrl} tooltip="Last ned dokument" /> : null}
        </HStack>

        <HStack gap="space-4" align="center" wrap={false}>
          {headerExtra !== undefined ? headerExtra : null}

          <Tag data-color="brand-blue" variant="strong" size="xsmall" className="whitespace-nowrap">
            {currentPage === null || numPages === null
              ? '…'
              : `Side ${currentPage.toString(10)} av ${numPages.toString(10)}`}
          </Tag>

          {onPreviousPage !== undefined ? (
            <Tooltip content="Forrige side" describesChild>
              <Button
                size="xsmall"
                variant="tertiary"
                data-color="neutral"
                icon={<ChevronUpIcon aria-hidden />}
                onClick={onPreviousPage}
                disabled={isPreviousDisabled}
              />
            </Tooltip>
          ) : null}

          {onNextPage !== undefined ? (
            <Tooltip content="Neste side" describesChild>
              <Button
                size="xsmall"
                variant="tertiary"
                data-color="neutral"
                icon={<ChevronDownIcon aria-hidden />}
                onClick={onNextPage}
                disabled={isNextDisabled}
              />
            </Tooltip>
          ) : null}
        </HStack>
      </Box>
    </HStack>
  );
};
