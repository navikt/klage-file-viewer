import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import type { ReactNode } from 'react';
import { FileHeader } from '@/file-header/file-header';
import { A4_HEIGHT_PX, A4_WIDTH_PX } from '@/scale/constants';

/** Compute pixel dimensions for an A4 page at the given scale (percentage, e.g. 100). */
export const getA4Dimensions = (scale: number) => ({
  width: A4_WIDTH_PX * (scale / 100),
  height: A4_HEIGHT_PX * (scale / 100),
});

interface PlaceholderWrapperProps {
  scale: number;
  children: ReactNode;
}

export const PlaceholderWrapper = ({ scale, children }: PlaceholderWrapperProps) => {
  const { width, height } = getA4Dimensions(scale);

  return (
    <VStack
      align="center"
      justify="center"
      className="bg-ax-bg-neutral-moderate/30 shadow-ax-dialog"
      style={{ width, minHeight: height }}
    >
      {children}
    </VStack>
  );
};

interface PdfSectionPlaceholderProps {
  title: string;
  scale: number;
}

export const PdfSectionPlaceholder = ({ title, scale }: PdfSectionPlaceholderProps) => (
  <>
    <FileHeader title={title} currentPage={null} numPages={null} isLoading={false} />

    <PlaceholderWrapper scale={scale}>
      <Loader size="3xlarge" />
      <BodyShort>Venter på innlasting …</BodyShort>
    </PlaceholderWrapper>
  </>
);
