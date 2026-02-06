import { BodyShort, VStack } from '@navikt/ds-react';
import { FileHeader } from '@/file-header/file-header';

interface JsonSectionPlaceholderProps {
  title: string;
}

export const JsonSectionPlaceholder = ({ title }: JsonSectionPlaceholderProps) => (
  <>
    <FileHeader title={title} currentPage={null} numPages={null} isLoading={false} />

    <VStack align="center" justify="center" className="min-h-64 w-full bg-ax-bg-neutral-moderate/30 shadow-ax-dialog">
      <BodyShort>Venter på innlasting …</BodyShort>
    </VStack>
  </>
);
