import { LinkBrokenIcon, LinkIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';

interface Props {
  active: boolean;
  onToggle: () => void;
}

export const LinkWidthToScale = ({ active, onToggle }: Props) => (
  <Tooltip
    content={active ? 'Koble bredde fra skalering' : 'Koble bredde til skalering'}
    placement="top"
    describesChild
  >
    <Button
      size="xsmall"
      variant="tertiary"
      onClick={onToggle}
      data-color="neutral"
      icon={active ? <LinkIcon aria-hidden /> : <LinkBrokenIcon aria-hidden />}
      aria-label={active ? 'Koble bredde fra skalering' : 'Koble bredde til skalering'}
      aria-pressed={active}
    />
  </Tooltip>
);
