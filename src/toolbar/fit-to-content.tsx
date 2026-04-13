import { SidebarLeftIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { computeFitToContentWidth } from '@/lib/page-measure';
import { MIN_INLINE_WIDTH } from '@/scale/constants';
import { useToolbarHeight } from '@/toolbar-height-context';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onFitToContent: (width: number) => void;
}

export const FitToContent = ({ scrollContainerRef, onFitToContent }: Props) => {
  const toolbarHeight = useToolbarHeight();

  const handleFitToContent = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const targetWidth = computeFitToContentWidth(scrollContainer, toolbarHeight);

    if (targetWidth === null) {
      return;
    }

    onFitToContent(Math.max(targetWidth, MIN_INLINE_WIDTH));
  }, [scrollContainerRef, toolbarHeight, onFitToContent]);

  return (
    <Tooltip content="Tilpass bredden til innholdet" placement="top" describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        onClick={handleFitToContent}
        data-color="neutral"
        icon={<SidebarLeftIcon aria-hidden />}
        aria-label="Tilpass bredden til innholdet"
      />
    </Tooltip>
  );
};
