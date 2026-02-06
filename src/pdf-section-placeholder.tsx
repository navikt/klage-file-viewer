import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { StickyHeader } from './sticky-header';

/** A4 page width in PDF points (72 DPI). */
export const A4_WIDTH_PT = 595;

/** A4 page height in PDF points (72 DPI). */
export const A4_HEIGHT_PT = 842;

/** Compute pixel dimensions for an A4 page at the given scale (percentage, e.g. 125). */
export const getA4Dimensions = (scale: number) => ({
  width: A4_WIDTH_PT * (scale / 100),
  height: A4_HEIGHT_PT * (scale / 100),
});

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
const NOOP = () => {};

interface PdfSectionPlaceholderProps {
  title: string;
  scale: number;
}

export const PdfSectionPlaceholder = ({ title, scale }: PdfSectionPlaceholderProps) => {
  const { width, height } = getA4Dimensions(scale);

  return (
    <>
      <StickyHeader title={title} currentPage={null} numPages={null} isLoading={false} refresh={NOOP} />

      <VStack
        align="center"
        justify="center"
        className="bg-ax-bg-neutral-moderate/30 shadow-ax-dialog"
        style={{ width, minHeight: height }}
      >
        <Loader size="3xlarge" />
        <BodyShort>Venter på innlasting …</BodyShort>
      </VStack>
    </>
  );
};
