import { BodyShort, Loader } from '@navikt/ds-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useFileViewerConfig } from '@/context';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { FileErrorLayout } from '@/files/file-error-layout';
import { PlaceholderWrapper } from '@/files/pdf/pdf-section-placeholder';
import { useRegisterRefresh } from '@/hooks/use-refresh-registry';
import { usePrint } from '@/lib/print-frame';
import type { FileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

interface LoadedImageSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  onPageCountReady: (pageCount: number) => void;
  documentNavigation?: DocumentNavigation;
}

export const LoadedImageSection = ({
  file,
  headerVariant,
  scale,
  onPageCountReady,
  documentNavigation,
}: LoadedImageSectionProps) => {
  const { errorComponent: ErrorComponent } = useFileViewerConfig();
  const { printBlob } = usePrint();
  const { data, fetching, error, refresh } = useFileData(file.url, file.query);

  useRegisterRefresh(file.url, refresh);

  const handlePrint = useCallback(() => {
    if (data !== null) {
      printBlob(data, data.type || 'image/jpeg');
    }
  }, [data, printBlob]);

  const objectUrl = useMemo(() => {
    if (data === null) {
      return undefined;
    }

    return URL.createObjectURL(data);
  }, [data]);

  useEffect(() => {
    const url = objectUrl;

    return () => {
      if (url !== undefined) {
        URL.revokeObjectURL(url);
      }
    };
  }, [objectUrl]);

  useEffect(() => {
    onPageCountReady(1);
  }, [onPageCountReady]);

  if (error !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={fetching}
        refresh={refresh}
        heading="Feil ved lasting av bilde"
        errorMessage={error}
        ErrorComponent={ErrorComponent}
        documentNavigation={documentNavigation}
      />
    );
  }

  if (objectUrl === undefined) {
    return (
      <>
        <FileHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTabUrl={file.newTabUrl}
          downloadUrl={file.downloadUrl}
          variant={headerVariant}
          isLoading={fetching}
          refresh={refresh}
          documentNavigation={documentNavigation}
        />

        <PlaceholderWrapper scale={scale}>
          <Loader size="3xlarge" />
          <BodyShort>Laster bilde …</BodyShort>
        </PlaceholderWrapper>
      </>
    );
  }

  const scaleFactor = scale / 100;

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={1}
        numPages={1}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        onPrint={handlePrint}
        variant={headerVariant}
        isLoading={fetching}
        refresh={refresh}
        documentNavigation={documentNavigation}
      />

      <div
        data-klage-file-viewer-page-number={1}
        data-klage-file-viewer-scalable
        className="relative flex w-full justify-center overflow-x-auto"
      >
        <img
          src={objectUrl}
          alt={file.title}
          className="block max-w-none shadow-ax-dialog"
          style={{ width: `calc(210mm * ${scaleFactor.toString()})` }}
          draggable={false}
        />
      </div>
    </>
  );
};
