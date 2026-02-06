import { ExpandVerticalIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { computeFitHeightScale, getScalablePage } from '@/lib/page-measure';
import { useToolbarHeight } from '@/toolbar-height-context';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  onFitToHeight: (scale: number) => void;
}

export const FitHeight = ({ scrollContainerRef, scale, onFitToHeight }: Props) => {
  const scrollToPage = useScrollToPage();
  const toolbarHeight = useToolbarHeight();

  const handleFitToHeight = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const pageElement = getScalablePage(scrollContainer, toolbarHeight);

    if (pageElement === null) {
      return;
    }

    const fitScale = computeFitHeightScale(pageElement, scrollContainer, scale, toolbarHeight);

    if (fitScale === null) {
      return;
    }

    onFitToHeight(fitScale);

    scrollToPage(pageElement, scrollContainer, toolbarHeight);
  }, [scrollContainerRef, toolbarHeight, scale, onFitToHeight, scrollToPage]);

  return (
    <Tooltip content="Tilpass høyden" placement="top" describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        onClick={handleFitToHeight}
        data-color="neutral"
        icon={<ExpandVerticalIcon aria-hidden />}
      />
    </Tooltip>
  );
};
