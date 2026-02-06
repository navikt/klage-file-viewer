import { ExpandIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { computeFitHeightScale, computeFitWidthScale, getScalablePage } from '@/lib/page-measure';
import { useToolbarHeight } from '@/toolbar-height-context';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  onFitToPage: (scale: number) => void;
}

export const FitPage = ({ scrollContainerRef, scale, onFitToPage }: Props) => {
  const scrollToPage = useScrollToPage();
  const toolbarHeight = useToolbarHeight();

  const handleFitToPage = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const pageElement = getScalablePage(scrollContainer, toolbarHeight);

    if (pageElement === null) {
      return;
    }

    const fitWidth = computeFitWidthScale(pageElement, scrollContainer, scale, toolbarHeight);
    const fitHeight = computeFitHeightScale(pageElement, scrollContainer, scale, toolbarHeight);

    if (fitWidth === null || fitHeight === null) {
      return;
    }

    // Pick the smaller scale so the page fits within both dimensions.
    onFitToPage(Math.min(fitWidth, fitHeight));

    scrollToPage(pageElement, scrollContainer, toolbarHeight);
  }, [scrollContainerRef, toolbarHeight, scale, onFitToPage, scrollToPage]);

  return (
    <Tooltip content="Tilpass siden" placement="top" describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        onClick={handleFitToPage}
        data-color="neutral"
        icon={<ExpandIcon aria-hidden />}
      />
    </Tooltip>
  );
};
