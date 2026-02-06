import { ChevronUpDownIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { MAX_SCALE, MIN_SCALE } from './constants';
import { clamp } from './lib/clamp';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  padding: number;
  onFitToHeight: (scale: number) => void;
}

/**
 * Find the page element (`[data-page-number]`) that is most visible inside the scroll container.
 * Returns `null` when no page elements exist.
 */
const getMostVisiblePage = (scrollContainer: HTMLDivElement): HTMLDivElement | null => {
  const pages = scrollContainer.querySelectorAll<HTMLDivElement>('[data-page-number]');

  if (pages.length === 0) {
    return null;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  let bestElement: HTMLDivElement | null = null;
  let bestVisibleArea = 0;

  for (const page of pages) {
    const pageRect = page.getBoundingClientRect();

    const overlapTop = Math.max(containerRect.top, pageRect.top);
    const overlapBottom = Math.min(containerRect.bottom, pageRect.bottom);
    const overlapLeft = Math.max(containerRect.left, pageRect.left);
    const overlapRight = Math.min(containerRect.right, pageRect.right);

    const visibleHeight = Math.max(0, overlapBottom - overlapTop);
    const visibleWidth = Math.max(0, overlapRight - overlapLeft);
    const visibleArea = visibleHeight * visibleWidth;

    if (visibleArea > bestVisibleArea) {
      bestVisibleArea = visibleArea;
      bestElement = page;
    }
  }

  return bestElement;
};

export const FitHeight = ({ scrollContainerRef, scale, padding, onFitToHeight }: Props) => {
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

    const unscaledHeight = renderedHeight / (scale / 100);
    const scrollContainerHeight = scrollContainer.clientHeight - padding;
    const fitScale = Math.floor((scrollContainerHeight / unscaledHeight) * 100);
    const clampedScale = clamp(fitScale, MIN_SCALE, MAX_SCALE);

    onFitToHeight(clampedScale);

    requestAnimationFrame(() => {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [scrollContainerRef, scale, padding, onFitToHeight]);

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
