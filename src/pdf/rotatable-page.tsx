import { RotateLeftIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { type RefCallback, useCallback } from 'react';
import { useRotation } from '@/hooks/use-rotation';
import { PdfPage } from '@/pdf/page';
import { HighlightLayer } from '@/pdf/search/highlight-layer';
import type { HighlightRect } from '@/pdf/search/types';
import type { RotationDegrees } from '@/types';

interface RotatablePageProps {
  page: PDFPageProxy;
  url: string;
  scale: number;
  highlights?: HighlightRect[];
  currentMatchIndex?: number;
  setPageRef?: (pageNumber: number, element: HTMLDivElement | null) => void;
}

export const RotatablePage = ({ page, url, scale, highlights, currentMatchIndex, setPageRef }: RotatablePageProps) => {
  const { rotation, setRotation } = useRotation(url, page.pageNumber);

  const refCallback: RefCallback<HTMLDivElement> = useCallback(
    (el) => {
      setPageRef?.(page.pageNumber, el);
    },
    [setPageRef, page.pageNumber],
  );

  const handleRotate = useCallback(() => {
    setRotation((prev) => ((prev - 90 + 360) % 360) as RotationDegrees);
  }, [setRotation]);

  const hasHighlights = highlights !== undefined && highlights.length > 0;

  return (
    <div
      ref={refCallback}
      data-page-number={page.pageNumber}
      className="group/page relative m-1 w-fit shadow-ax-dialog"
    >
      <PdfPage page={page} scale={scale / 100} rotation={rotation} />

      {hasHighlights && currentMatchIndex !== undefined ? (
        <HighlightLayer highlights={highlights} currentMatchIndex={currentMatchIndex} />
      ) : null}

      <div className="absolute top-2 left-2 z-10 opacity-0 transition-opacity group-hover/page:opacity-100">
        <Tooltip content="Roter mot klokken" describesChild>
          <Button
            size="xsmall"
            variant="tertiary"
            onClick={handleRotate}
            data-color="neutral"
            icon={<RotateLeftIcon aria-hidden />}
            className="bg-ax-bg-default/80 shadow-ax-card backdrop-blur-xs"
          />
        </Tooltip>
      </div>
    </div>
  );
};
