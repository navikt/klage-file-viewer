import { ExpandVerticalIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { computeFitWidthScale, getScalablePage } from '@/lib/page-measure';
import { useToolbarHeight } from '@/toolbar-height-context';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  onFitToWidth: (scale: number) => void;
}

export const FitWidth = ({ scrollContainerRef, scale, onFitToWidth }: Props) => {
  const scrollToPage = useScrollToPage();
  const toolbarHeight = useToolbarHeight();

  const handleFitToWidth = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const pageElement = getScalablePage(scrollContainer, toolbarHeight);

    if (pageElement === null) {
      return;
    }

    const fitScale = computeFitWidthScale(pageElement, scrollContainer, scale, toolbarHeight);

    if (fitScale === null) {
      return;
    }

    onFitToWidth(fitScale);

    scrollToPage(pageElement, scrollContainer, toolbarHeight);
  }, [scrollContainerRef, toolbarHeight, scale, onFitToWidth, scrollToPage]);

  return (
    <Tooltip content="Tilpass bredden" placement="top" describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        onClick={handleFitToWidth}
        data-color="neutral"
        icon={<ExpandVerticalIcon aria-hidden className="rotate-90" />}
      />
    </Tooltip>
  );
};
