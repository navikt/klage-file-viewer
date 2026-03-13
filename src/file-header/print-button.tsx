import { PrinterSmallIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';

interface PrintButtonProps {
  onPrint: () => void;
  tooltip: string;
}

export const PrintButton = ({ onPrint, tooltip }: PrintButtonProps) => (
  <Tooltip content={tooltip} describesChild>
    <Button
      onClick={onPrint}
      icon={<PrinterSmallIcon aria-hidden />}
      size="xsmall"
      variant="tertiary"
      data-color="neutral"
    />
  </Tooltip>
);
