import { ChevronDownUpIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback } from 'react';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { getScalablePage } from '@/lib/page-measure';
import { INITIAL_SCALE } from '@/scale/constants';
import { useToolbarHeight } from '@/toolbar-height-context';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onDefaultScale: (scale: number) => void;
}

export const DefaultScale = ({ scrollContainerRef, onDefaultScale }: Props) => {
  const scrollToPage = useScrollToPage();
  const toolbarHeight = useToolbarHeight();

  const handleDefaultSize = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const pageElement = getScalablePage(scrollContainer, toolbarHeight);

    onDefaultScale(INITIAL_SCALE);

    if (pageElement === null) {
      return;
    }

    scrollToPage(pageElement, scrollContainer, toolbarHeight);
  }, [scrollContainerRef, toolbarHeight, onDefaultScale, scrollToPage]);

  return (
    <Tooltip content={`${INITIAL_SCALE.toString(10)}% størrelse`} placement="top" describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        onClick={handleDefaultSize}
        data-color="neutral"
        icon={<ChevronDownUpIcon aria-hidden />}
      />
    </Tooltip>
  );
};
