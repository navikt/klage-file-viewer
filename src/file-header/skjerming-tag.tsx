import { Tag, Tooltip } from '@navikt/ds-react';
import type { Skjerming } from '@/types';

interface SkjermingTagProps {
  hasAccess: boolean;
  skjerming: Skjerming | null;
}

export const SkjermingTag = ({ hasAccess, skjerming }: SkjermingTagProps) => {
  if (!hasAccess || skjerming === null) {
    return null;
  }

  return skjerming === 'POL' ? <PolTag /> : <FeilTag />;
};

const PolTag = () => (
  <Tooltip content="Dokumentet er begrenset basert på personopplysningsloven">
    <Tag data-color="warning" size="xsmall" variant="strong">
      Begrenset
    </Tag>
  </Tooltip>
);

const FeilTag = () => (
  <Tooltip content="Dokumentet er markert for sletting">
    <Tag data-color="danger" size="xsmall" variant="strong">
      Slettes
    </Tag>
  </Tooltip>
);
