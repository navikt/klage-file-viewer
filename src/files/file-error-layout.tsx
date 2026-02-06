import { ArrowsCirclepathIcon, DownloadIcon } from '@navikt/aksel-icons';
import { Alert, Button, Heading, HStack } from '@navikt/ds-react';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import { type ResolvedVariant, resolveVariantUrl } from '@/file-header/variant-types';
import type { FileEntry } from '@/types';

interface FileErrorLayoutProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  isLoading: boolean;
  refresh: () => void;
  heading: string;
  errorMessage: string;
  ErrorComponent?: React.ComponentType<{ refresh: () => void }>;
  documentNavigation?: DocumentNavigation;
}

export const FileErrorLayout = ({
  file,
  headerVariant,
  isLoading,
  refresh,
  heading,
  errorMessage,
  ErrorComponent,
  documentNavigation,
}: FileErrorLayoutProps) => {
  const resolvedDownloadUrl = resolveVariantUrl(file.downloadUrl, headerVariant);

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={null}
        numPages={null}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        variant={headerVariant}
        isLoading={isLoading}
        refresh={refresh}
        documentNavigation={documentNavigation}
      />

      <div className="w-full grow p-5">
        <Alert variant="error" size="small">
          <HStack gap="space-16" align="center">
            <Heading size="small">{heading}</Heading>

            {ErrorComponent !== undefined ? <ErrorComponent refresh={refresh} /> : null}

            <Button
              data-color="neutral"
              variant="secondary"
              size="small"
              icon={<ArrowsCirclepathIcon aria-hidden />}
              onClick={refresh}
            >
              Last fil på nytt
            </Button>

            {resolvedDownloadUrl !== undefined ? (
              <Button
                as="a"
                href={resolvedDownloadUrl}
                download={file.title}
                icon={<DownloadIcon aria-hidden />}
                variant="secondary"
                size="small"
                target="_blank"
              >
                Last ned fil
              </Button>
            ) : null}

            <code className="border-2 border-ax-border-neutral bg-ax-bg-neutral-moderate p-2 text-xs">
              {errorMessage}
            </code>
          </HStack>
        </Alert>
      </div>
    </>
  );
};
