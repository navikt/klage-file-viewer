import { Box, HStack, Radio, RadioGroup, TextField } from '@navikt/ds-react';
import { useCallback, useState } from 'react';
import { clamp } from '@/lib/clamp';
import { Keys } from '@/lib/keys';
import { MAX_SCALE, MIN_SCALE } from '@/scale/constants';

const PRESETS: string[] = ['100', '125', '150', '200', '300', '400', '500', '700', '900'];
const CUSTOM = 'CUSTOM';

interface ScaleSelectProps {
  scale: number;
  setScale: (scale: number) => void;
  scaleUp: () => number;
  scaleDown: () => number;
  close: () => void;
}

export const ScaleSelect = ({ scale, setScale, scaleUp, scaleDown, close }: ScaleSelectProps) => {
  const [inputValue, setInputValue] = useState<string>(scale.toString(10));

  const onRadioChange = (val: unknown) => {
    if (val === CUSTOM) {
      setInputValue(scale.toString(10));

      return;
    }

    if (typeof val !== 'string') {
      return;
    }

    const parsed = Number.parseInt(val, 10);

    if (Number.isNaN(parsed)) {
      return;
    }

    setScale(parsed);
    setInputValue(parsed.toString(10));
  };

  const stringValue = scale.toString();
  const radioValue = PRESETS.includes(stringValue) ? stringValue : CUSTOM;

  const setStringValue = useCallback(
    (newStringValue: string) => {
      if (newStringValue.length === 0) {
        return;
      }

      const parsed = Number.parseInt(newStringValue, 10);

      if (Number.isNaN(parsed)) {
        return;
      }

      const clamped = clamp(parsed, MIN_SCALE, MAX_SCALE);

      setInputValue(clamped.toString(10));
      setScale(clamped);
    },
    [setScale],
  );

  return (
    <Box
      background="default"
      padding="space-8"
      borderRadius="4"
      shadow="dialog"
      className="absolute right-0 bottom-full z-10 flex flex-col gap-2 whitespace-nowrap text-ax-text-neutral not-italic"
    >
      <RadioGroup legend="Skalering" onChange={onRadioChange} value={radioValue} size="small">
        {PRESETS.map((p) => (
          <Radio key={p} value={p} size="small">
            {p} %
          </Radio>
        ))}
        <Radio value={CUSTOM} disabled>
          Egendefinert
        </Radio>
      </RadioGroup>
      <HStack align="center" gap="space-8" wrap={false}>
        <TextField
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);

            const number = Number.parseInt(e.target.value, 10);

            if (!Number.isNaN(number)) {
              setScale(clamp(number, MIN_SCALE, MAX_SCALE));
            }
          }}
          onBlur={() => setStringValue(inputValue)}
          onKeyDown={(e) => {
            switch (e.key) {
              case Keys.Enter:
              case Keys.Escape:
                close();
                break;
              case Keys.ArrowUp: {
                e.preventDefault();
                setInputValue(scaleUp().toString(10));
                break;
              }
              case Keys.ArrowDown: {
                e.preventDefault();
                setInputValue(scaleDown().toString(10));
                break;
              }
            }
          }}
          size="small"
          label="Skalering"
          hideLabel
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <span>%</span>
      </HStack>
    </Box>
  );
};
