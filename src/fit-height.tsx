import { ChevronUpDownIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { MAX_SCALE, MIN_SCALE } from '@/constants';
import { clamp } from '@/lib/clamp';
import { getMostVisiblePage, getStickyHeaderOffset, scrollToPage } from '@/lib/page-scroll';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  onFitToHeight: (scale: number) => void;
}

export const FitHeight = ({ scrollContainerRef, scale, onFitToHeight }: Props) => {
  const handleFitToHeight = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const pageElement = getMostVisiblePage(scrollContainer);

    if (pageElement === null) {
      return;
    }

    const renderedHeight = pageElement.offsetHeight;

    if (renderedHeight === 0) {
      return;
    }

    const stickyHeaderOffset = getStickyHeaderOffset(pageElement, scrollContainer);

    // Available height for the page: viewport minus the header/gap reserved
    // above and below for visual symmetry.
    const availableHeight = scrollContainer.clientHeight - stickyHeaderOffset;

    const unscaledHeight = renderedHeight / (scale / 100);
    const fitScale = Math.floor((availableHeight / unscaledHeight) * 100);
    const clampedScale = clamp(fitScale, MIN_SCALE, MAX_SCALE);

    onFitToHeight(clampedScale);

    requestAnimationFrame(() => {
      scrollToPage(pageElement, scrollContainer, { behavior: 'smooth' });
    });
  }, [scrollContainerRef, scale, onFitToHeight]);

  return (
    <Tooltip content="Tilpass høyden" placement="top" describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        onClick={handleFitToHeight}
        data-color="neutral"
        icon={<ChevronUpDownIcon aria-hidden />}
      />
    </Tooltip>
  );
};
