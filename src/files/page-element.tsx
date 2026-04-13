import { BodyShort, Loader, VStack } from '@navikt/ds-react';
import { RotateButton } from '@/files/rotate-button';

interface PageElementProps {
  ref?: React.Ref<HTMLDivElement>;
  pageNumber: number;
  children: React.ReactNode;
  /** Callback to rotate the page. When provided, renders a rotate button. */
  onRotate?: () => void;
  /** When provided, renders a loading overlay with this message. */
  loadingMessage?: string;
}

/**
 * Shared page element wrapper used by all file types.
 *
 * DOM structure:
 * ```
 * [data-klage-file-viewer-scalable] (page element, w-full)
 *   RotateButton (absolute, optional)
 *   LoadingOverlay (absolute, optional)
 *   overflow-x-auto
 *     [data-klage-file-viewer-content] (w-fit px-2 mx-auto)
 *       children
 * ```
 */
export const PageElement = ({ ref, pageNumber, children, onRotate, loadingMessage }: PageElementProps) => (
  <div
    ref={ref}
    data-klage-file-viewer-page-number={pageNumber}
    data-klage-file-viewer-scalable
    className="relative w-full"
  >
    {onRotate !== undefined ? <RotateButton pageNumber={pageNumber} onRotate={onRotate} /> : null}

    {loadingMessage !== undefined ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-ax-bg-neutral-moderate/70 backdrop-blur-xs">
        <VStack align="center" gap="space-8">
          <Loader size="3xlarge" />
          <BodyShort>{loadingMessage}</BodyShort>
        </VStack>
      </div>
    ) : null}

    <div className="overflow-x-auto py-2">
      <div className="mx-auto w-fit px-2" data-klage-file-viewer-content>
        {children}
      </div>
    </div>
  </div>
);
