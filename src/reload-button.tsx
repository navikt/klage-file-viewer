import { ArrowsCirclepathIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';

interface Props {
  isLoading: boolean;
  onClick: () => void;
}

export const ReloadButton = ({ isLoading, onClick }: Props) => (
  <Tooltip content="Oppdater dokumentet" describesChild>
    <Button
      data-color="neutral"
      onClick={onClick}
      loading={isLoading}
      icon={<ArrowsCirclepathIcon aria-hidden />}
      size="xsmall"
      variant="tertiary"
    />
  </Tooltip>
);
