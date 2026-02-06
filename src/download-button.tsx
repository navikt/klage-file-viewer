import { DownloadIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';

interface DownloadButtonProps {
  url: string;
  tooltip: string;
}

export const DownloadButton = ({ url, tooltip }: DownloadButtonProps) => (
  <Tooltip content={tooltip} describesChild>
    <Button
      as="a"
      href={url}
      download
      icon={<DownloadIcon aria-hidden />}
      size="xsmall"
      variant="tertiary"
      data-color="neutral"
    />
  </Tooltip>
);
