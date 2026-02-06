import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { getA4Dimensions } from '@/pdf/pdf-section-placeholder';
import { StickyHeader } from '@/sticky-header';

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
const NOOP = () => {};

interface ExcelSectionPlaceholderProps {
  title: string;
  scale: number;
}

export const ExcelSectionPlaceholder = ({ title, scale }: ExcelSectionPlaceholderProps) => {
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
