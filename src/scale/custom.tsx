import { MinusIcon, PlusIcon } from '@navikt/aksel-icons';
import { Box, Button, HStack } from '@navikt/ds-react';
import { useRef, useState } from 'react';
import { useOnClickOutside } from '@/hooks/use-on-click-outside';
import { snapDown, snapUp } from '@/lib/snap';
import { MAX_SCALE, MIN_SCALE, STEP, USER_STEP } from '@/scale/constants';
import { ScaleSelect } from '@/scale/scale-select';

interface Props {
  scale: number;
  onChange: (scale: number) => number;
}

export const CustomScale = ({ scale, onChange }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setIsOpen(false));

  const scaleDown = () => onChange(snapDown(scale, USER_STEP, MIN_SCALE));
  const scaleUp = () => onChange(snapUp(scale, USER_STEP, MAX_SCALE));

  return (
    <Box
      background="default"
      padding="space-4"
      borderRadius="4"
      marginBlock="space-0 space-8"
      marginInline="space-8"
      className="flex flex-row items-center justify-center gap-2"
    >
      <HStack align="center">
        <Button
          data-color="neutral"
          icon={<MinusIcon aria-hidden />}
          size="xsmall"
          variant="tertiary"
          onClick={scaleDown}
        />
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={STEP}
          value={scale}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        />
        <Button
          data-color="neutral"
          icon={<PlusIcon aria-hidden />}
          size="xsmall"
          variant="tertiary"
          onClick={scaleUp}
        />
      </HStack>

      <div ref={ref} className="relative">
        <Button
          data-color="neutral"
          onClick={() => setIsOpen((o) => !o)}
          size="xsmall"
          variant="tertiary"
          className="w-16"
        >
          {scale} %
        </Button>
        {isOpen ? (
          <ScaleSelect
            scale={scale}
            setScale={onChange}
            scaleUp={scaleUp}
            scaleDown={scaleDown}
            close={() => setIsOpen(false)}
          />
        ) : null}
      </div>
    </Box>
  );
};
