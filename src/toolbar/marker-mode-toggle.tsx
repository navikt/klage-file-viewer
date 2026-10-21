import { PencilLineFillIcon, PencilLineIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useMarkerMode } from '@/marker-mode-context';

export const MarkerModeToggle = () => {
  const { markerMode, markerModeDisabled, toggleMarkerMode } = useMarkerMode();
  const label = markerModeDisabled
    ? 'Markeringstusjen er utilgjengelig til markeringene er lastet inn'
    : markerMode
      ? 'Slå av markeringstusj'
      : 'Slå på markeringstusj';

  return (
    <Tooltip content={label} keys={markerMode ? ['Esc'] : undefined} describesChild>
      <Button
        size="xsmall"
        variant={markerMode ? 'primary' : 'tertiary'}
        data-color={markerMode ? 'accent' : 'neutral'}
        onClick={toggleMarkerMode}
        disabled={markerModeDisabled}
        icon={markerMode ? <PencilLineFillIcon aria-hidden /> : <PencilLineIcon aria-hidden />}
        aria-label="Markeringstusj"
        aria-pressed={markerMode}
      />
    </Tooltip>
  );
};
