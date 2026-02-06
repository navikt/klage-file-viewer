import { CaretLeftRightIcon, CaretUpDownIcon, ExpandIcon, LaptopIcon, PersonIcon } from '@navikt/aksel-icons';
import { BodyLong, Heading, HelpText, VStack } from '@navikt/ds-react';
import { useCallback, useRef } from 'react';
import { KlageFileViewerFitMode } from '@/hooks/use-initial-scale';
import { useScaleSettings } from '@/hooks/use-scale-settings';
import { INITIAL_SCALE } from '@/scale/constants';
import { CustomScale } from '@/scale/custom';
import { PdfScaleModeToggle } from '@/scale/toggle';

export const ScaleSettings = () => {
  const { scaleMode, setScaleMode, customScale, setCustomScale } = useScaleSettings();

  const onScaleModeChange = (value: KlageFileViewerFitMode) => {
    setScaleMode(value);
  };

  const timeoutRef = useRef<Timer>(null);

  const onCustomScaleChange = useCallback(
    (value: number): number => {
      setCustomScale(value);
      setScaleMode(KlageFileViewerFitMode.CUSTOM);

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        // Custom scale change debounce complete.
      }, 300);

      return value;
    },
    [setCustomScale, setScaleMode],
  );

  return (
    <VStack marginBlock="space-16 space-0">
      <Heading level="2" size="small" spacing className="flex flex-row items-center gap-2">
        <span>Skalering av filer åpnet i ny fane</span>

        <HelpText>
          <BodyLong spacing>
            Setter skalering for filer åpnet i ny fane. Du kan også tilpasse skaleringen i filvisningen.
          </BodyLong>

          <BodyLong>Denne innstillingen huskes per nettleser.</BodyLong>
        </HelpText>
      </Heading>

      <PdfScaleModeToggle
        value={scaleMode}
        onChange={onScaleModeChange}
        options={[
          {
            label: 'Tilpass til skjermen',
            description: 'Tilpasser PDF til skjermbredden og -høyden',
            icon: <ExpandIcon aria-hidden />,
            scaleMode: KlageFileViewerFitMode.PAGE_FIT,
          },
          {
            label: 'Tilpass til skjermhøyden',
            description: 'Tilpasser PDF til skjermhøyden',
            icon: <CaretUpDownIcon aria-hidden />,
            scaleMode: KlageFileViewerFitMode.PAGE_HEIGHT,
          },
          {
            label: 'Tilpass til skjermbredden',
            description: 'Tilpasser PDF til skjermbredden',
            icon: <CaretLeftRightIcon aria-hidden />,
            scaleMode: KlageFileViewerFitMode.PAGE_WIDTH,
          },
          {
            label: 'Egendefinert',
            description: `${customScale} % av original størrelse`,
            interactiveContent: <CustomScale scale={customScale} onChange={onCustomScaleChange} />,
            icon: <PersonIcon aria-hidden />,
            scaleMode: KlageFileViewerFitMode.CUSTOM,
            customScale,
          },
          {
            label: 'Standard skalering',
            description: `${INITIAL_SCALE.toString(10)} % av original størrelse`,
            icon: <LaptopIcon aria-hidden />,
            scaleMode: KlageFileViewerFitMode.NONE,
          },
        ]}
      />
    </VStack>
  );
};
