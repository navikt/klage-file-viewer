import { BodyShort, VStack } from '@navikt/ds-react';
import { useEffect } from 'react';
import { DownloadButton } from '@/download-button';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import { type ResolvedVariant, resolveVariantUrl } from '@/file-header/variant-types';
import { getA4Dimensions } from '@/files/pdf/pdf-section-placeholder';
import type { FileEntry } from '@/types';

interface UnsupportedSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  onPageCountReady: (pageCount: number) => void;
  documentNavigation?: DocumentNavigation;
}

export const UnsupportedSection = ({
  file,
  headerVariant,
  scale,
  onPageCountReady,
  documentNavigation,
}: UnsupportedSectionProps) => {
  const { width, height } = getA4Dimensions(scale);
  const resolvedDownloadUrl = resolveVariantUrl(file.downloadUrl, headerVariant);

  useEffect(() => {
    onPageCountReady(1);
  }, [onPageCountReady]);

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={null}
        numPages={null}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        variant={headerVariant}
        isLoading={false}
        documentNavigation={documentNavigation}
      />

      <VStack
        align="center"
        justify="center"
        gap="space-16"
        className="bg-ax-bg-neutral-moderate/30 shadow-ax-dialog"
        style={{ width, minHeight: height }}
      >
        <BodyShort>
          Filtypen{headerVariant !== undefined ? `, ${headerVariant.filtype},` : ''} kan ikke forhåndsvises.
        </BodyShort>

        {resolvedDownloadUrl !== undefined ? (
          <DownloadButton
            url={resolvedDownloadUrl}
            filename={file.title}
            tooltip="Last ned fil"
            size="small"
            variant="secondary"
          >
            Last ned fil
          </DownloadButton>
        ) : null}
      </VStack>
    </>
  );
};
