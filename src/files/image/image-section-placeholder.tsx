import { BodyShort } from '@navikt/ds-react';
import { FileHeader } from '@/file-header/file-header';
import { PlaceholderWrapper } from '@/files/pdf/pdf-section-placeholder';

interface ImageSectionPlaceholderProps {
  title: string;
  scale: number;
}

export const ImageSectionPlaceholder = ({ title, scale }: ImageSectionPlaceholderProps) => (
  <>
    <FileHeader title={title} currentPage={null} numPages={null} isLoading={false} />

    <PlaceholderWrapper scale={scale}>
      <BodyShort>Venter på innlasting …</BodyShort>
    </PlaceholderWrapper>
  </>
);
