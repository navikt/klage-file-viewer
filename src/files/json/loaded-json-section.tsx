import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { useEffect } from 'react';
import { useFileViewerConfig } from '@/context';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { FileErrorLayout } from '@/files/file-error-layout';
import { JsonTree } from '@/files/json/json-tree';
import { useJsonData } from '@/files/json/use-json-data';
import { useRegisterRefresh } from '@/hooks/use-refresh-registry';
import type { FileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

interface LoadedJsonSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  onPageCountReady: (pageCount: number) => void;
  documentNavigation?: DocumentNavigation;
}

export const LoadedJsonSection = ({
  file,
  headerVariant,
  onPageCountReady,
  documentNavigation,
}: LoadedJsonSectionProps) => {
  const { errorComponent: ErrorComponent } = useFileViewerConfig();
  const { data, fetching, error, refresh } = useFileData(file.url, file.query);

  useRegisterRefresh(file.url, refresh);

  const { json, parsing, parseError } = useJsonData(data);
  const isHeaderLoading = fetching || parsing;

  useEffect(() => {
    onPageCountReady(1);
  }, [onPageCountReady]);

  if (error !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={isHeaderLoading}
        refresh={refresh}
        heading="Feil ved lasting av JSON-fil"
        errorMessage={error}
        ErrorComponent={ErrorComponent}
        documentNavigation={documentNavigation}
      />
    );
  }

  if (parseError !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={isHeaderLoading}
        refresh={refresh}
        heading="Feil ved lesing av JSON-fil"
        errorMessage={parseError}
        documentNavigation={documentNavigation}
      />
    );
  }

  if (json === undefined) {
    return (
      <>
        <FileHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTabUrl={file.newTabUrl}
          downloadUrl={file.downloadUrl}
          variant={headerVariant}
          isLoading={isHeaderLoading}
          refresh={refresh}
          documentNavigation={documentNavigation}
        />

        <VStack
          align="center"
          justify="center"
          gap="space-16"
          className="min-h-64 w-full bg-ax-bg-neutral-moderate/30 shadow-ax-dialog"
        >
          <Loader size="3xlarge" />
          <BodyShort>Leser JSON-fil …</BodyShort>
        </VStack>
      </>
    );
  }

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={1}
        numPages={1}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        variant={headerVariant}
        isLoading={isHeaderLoading}
        refresh={refresh}
        documentNavigation={documentNavigation}
      />

      <div className="w-full overflow-auto rounded-lg bg-ax-bg-neutral-moderate/30 p-4 font-mono text-sm shadow-ax-dialog">
        <JsonTree value={json} />
      </div>
    </>
  );
};
