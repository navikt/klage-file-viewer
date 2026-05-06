import { DownloadIcon } from '@navikt/aksel-icons';
import { Button, type ButtonProps, Tooltip } from '@navikt/ds-react';

interface DownloadButtonProps {
  url: string;
  filename: string;
  tooltip: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  children?: React.ReactNode;
}

export const DownloadButton = ({
  url,
  filename,
  tooltip,
  size = 'xsmall',
  variant = 'tertiary',
  children,
}: DownloadButtonProps) => (
  <Tooltip content={tooltip} describesChild>
    <Button
      as="a"
      href={url}
      download={filename}
      icon={<DownloadIcon aria-hidden />}
      size={size}
      variant={variant}
      data-color="neutral"
    >
      {children}
    </Button>
  </Tooltip>
);
