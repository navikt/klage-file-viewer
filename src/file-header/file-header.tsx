import {
  FileCodeIcon,
  FileExcelIcon,
  FileImageIcon,
  FileJpegIcon,
  FileJsonIcon,
  FilePdfIcon,
  FilePngIcon,
  FileTextIcon,
  PadlockLockedFillIcon,
} from '@navikt/aksel-icons';
import { Box, HStack, Tag, Tooltip } from '@navikt/ds-react';
import type { ReactNode } from 'react';
import { DownloadButton } from '@/file-header/download-button';
import type { DocumentNavigation } from '@/file-header/page-navigation';
import { PageNavigation } from '@/file-header/page-navigation';
import { PrintButton } from '@/file-header/print-button';
import { RedactedSwitch } from '@/file-header/redacted-switch';
import { ReloadButton } from '@/file-header/reload-button';
import { SkjermingTag } from '@/file-header/skjerming-tag';
import { type ResolvedVariant, resolveVariantUrl } from '@/file-header/variant-types';
import { NewTabButton } from '@/new-tab-button';
import type { FileType } from '@/types';

export type { DocumentNavigation };

interface FileTypeConfig {
  icon: ReactNode;
  label: string;
  color: 'danger' | 'success' | 'info' | 'neutral';
}

const FILE_TYPE_CONFIG: Record<FileType, FileTypeConfig> = {
  PDF: { icon: <FilePdfIcon aria-hidden />, label: 'PDF', color: 'danger' },
  XLSX: { icon: <FileExcelIcon aria-hidden />, label: 'Excel', color: 'success' },
  JPEG: { icon: <FileJpegIcon aria-hidden />, label: 'JPEG', color: 'info' },
  PNG: { icon: <FilePngIcon aria-hidden />, label: 'PNG', color: 'info' },
  TIFF: { icon: <FileImageIcon aria-hidden />, label: 'TIFF', color: 'info' },
  JSON: { icon: <FileJsonIcon aria-hidden />, label: 'JSON', color: 'neutral' },
  XML: { icon: <FileCodeIcon aria-hidden />, label: 'XML', color: 'neutral' },
  AXML: { icon: <FileCodeIcon aria-hidden />, label: 'AXML', color: 'neutral' },
  DXML: { icon: <FileCodeIcon aria-hidden />, label: 'DXML', color: 'neutral' },
  RTF: { icon: <FileTextIcon aria-hidden />, label: 'RTF', color: 'neutral' },
};

interface FileHeaderProps {
  title: string;
  currentPage: number | null;
  numPages: number | null;
  newTabUrl?: string;
  downloadUrl?: string;
  onPrint?: () => void;
  variant?: ResolvedVariant;
  showPasswordIndicator?: boolean;
  showOcrIndicator?: boolean;
  isLoading: boolean;
  refresh?: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  previousPageDisabled?: boolean;
  nextPageDisabled?: boolean;
  documentNavigation?: DocumentNavigation;
}

export const FileHeader = ({
  title,
  currentPage,
  numPages,
  newTabUrl,
  downloadUrl,
  onPrint,
  variant,
  showPasswordIndicator,
  showOcrIndicator,
  isLoading,
  refresh,
  onPreviousPage,
  onNextPage,
  previousPageDisabled,
  nextPageDisabled,
  documentNavigation,
}: FileHeaderProps) => {
  const fileTypeConfig = variant !== undefined ? FILE_TYPE_CONFIG[variant.filtype] : undefined;
  const resolvedNewTabUrl = resolveVariantUrl(newTabUrl, variant);
  const resolvedDownloadUrl = resolveVariantUrl(downloadUrl, variant);

  return (
    <Box
      background="neutral-moderate"
      padding="space-8"
      className="sticky top-14.75 z-20 flex w-full flex-row items-center justify-between gap-1"
      shadow="dialog"
      borderRadius="8"
      data-klage-file-viewer-file-header
    >
      <HStack wrap={false} justify="start" align="center" gap="space-4" minWidth="0">
        <ReloadButton isLoading={isLoading} onClick={refresh} />

        {fileTypeConfig !== undefined ? (
          <Tag
            data-color={fileTypeConfig.color}
            variant="moderate"
            size="xsmall"
            className="shrink-0"
            icon={fileTypeConfig.icon}
          >
            {fileTypeConfig.label}
          </Tag>
        ) : null}

        <Tooltip content={title}>
          <h2 className="truncate font-ax-bold text-base">{title}</h2>
        </Tooltip>

        {showPasswordIndicator === true ? (
          <Tooltip content="Passordbeskyttet PDF" describesChild>
            <PadlockLockedFillIcon aria-label="Passordbeskyttet" className="shrink-0 text-ax-text-danger-decoration" />
          </Tooltip>
        ) : null}

        {showOcrIndicator === true ? (
          <Tooltip
            content="Teksten i dette dokumentet er hentet med tekstgjenkjenning (OCR) og kan inneholde feil"
            maxChar={1000}
          >
            <Tag data-color="warning" variant="moderate" size="xsmall" className="shrink-0">
              OCR
            </Tag>
          </Tooltip>
        ) : null}

        {resolvedNewTabUrl !== undefined ? (
          <NewTabButton url={resolvedNewTabUrl} tooltip="Åpne dokument i ny fane" />
        ) : null}

        {resolvedDownloadUrl !== undefined ? (
          <DownloadButton url={resolvedDownloadUrl} tooltip="Last ned dokument" />
        ) : null}

        {onPrint !== undefined ? <PrintButton onPrint={onPrint} tooltip="Skriv ut dokument" /> : null}
      </HStack>

      <HStack gap="space-4" align="center" wrap={false}>
        {variant !== undefined ? <SkjermingTag hasAccess={variant.hasAccess} skjerming={variant.skjerming} /> : null}
        {variant !== undefined ? (
          <RedactedSwitch
            hasRedactedDocuments={variant.hasRedactedDocuments}
            hasAccessToArchivedDocuments={variant.hasAccessToArchivedDocuments}
            showRedacted={variant.showRedacted}
            setShowRedacted={variant.setShowRedacted}
          />
        ) : null}

        <Tag data-color="brand-blue" variant="strong" size="xsmall" className="whitespace-nowrap">
          {currentPage === null || numPages === null
            ? '…'
            : `Side ${currentPage.toString(10)} av ${numPages.toString(10)}`}
        </Tag>

        <PageNavigation
          currentPage={currentPage}
          numPages={numPages}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
          previousPageDisabled={previousPageDisabled}
          nextPageDisabled={nextPageDisabled}
          documentNavigation={documentNavigation}
        />
      </HStack>
    </Box>
  );
};
