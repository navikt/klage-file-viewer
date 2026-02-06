import { ExternalLinkIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback, useRef } from 'react';
import type { NewTabProps } from '@/types';

interface NewTabButtonProps extends NewTabProps {
  tooltip: string;
}

export const NewTabButton = ({ url, id, tooltip }: NewTabButtonProps) => {
  const tabRef = useRef<WindowProxy | null>(null);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      if (e.button !== 1 && e.button !== 0) {
        return;
      }

      e.preventDefault();

      if (tabRef.current !== null && !tabRef.current.closed) {
        tabRef.current.focus();

        return;
      }

      const ref = window.open(url, id);

      if (ref !== null) {
        tabRef.current = ref;
      }
    },
    [url, id],
  );

  return (
    <Tooltip content={tooltip} describesChild>
      <Button
        as="a"
        href={url}
        target={id}
        icon={<ExternalLinkIcon aria-hidden />}
        onClick={handleClick}
        onAuxClick={handleClick}
        size="xsmall"
        variant="tertiary"
        data-color="neutral"
      />
    </Tooltip>
  );
};
