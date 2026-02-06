import { ExternalLinkIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsCurrentUrl } from '@/hooks/use-current-url';

interface NewTabButtonProps {
  url: string;
  tooltip: string;
}

const toTargetName = async (url: string): Promise<string> => {
  const encoded = new TextEncoder().encode(url);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hash);

  return bytes.toHex();
};

export const NewTabButton = ({ url, tooltip }: NewTabButtonProps) => {
  const isCurrent = useIsCurrentUrl(url);
  const tabRef = useRef<WindowProxy | null>(null);
  const [target, setTarget] = useState<string | undefined>(undefined);

  useEffect(() => {
    tabRef.current = null;

    if (isCurrent) {
      return;
    }

    let cancelled = false;

    toTargetName(url).then((name) => {
      if (!cancelled) {
        setTarget(name);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url, isCurrent]);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      if (e.button !== 1 && e.button !== 0) {
        return;
      }

      e.preventDefault();

      if (target === undefined) {
        return;
      }

      if (tabRef.current !== null && !tabRef.current.closed) {
        tabRef.current.focus();

        return;
      }

      const ref = window.open(url, target);

      if (ref !== null) {
        tabRef.current = ref;
      }
    },
    [url, target],
  );

  if (isCurrent) {
    return null;
  }

  return (
    <Tooltip content={tooltip} describesChild>
      <Button
        as="a"
        href={url}
        target={target}
        icon={<ExternalLinkIcon aria-hidden />}
        onClick={handleClick}
        onAuxClick={handleClick}
        size="xsmall"
        variant="tertiary"
        data-color="neutral"
        disabled={target === undefined}
      />
    </Tooltip>
  );
};
