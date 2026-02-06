import { ZoomMinusIcon, ZoomPlusIcon } from '@navikt/aksel-icons';
import { Button, HStack, Tooltip } from '@navikt/ds-react';
import { type Dispatch, type KeyboardEvent, type SetStateAction, useCallback, useEffect, useState } from 'react';
import { clamp } from './lib/clamp';
import { Keys, MOD_KEY_TEXT } from './lib/keys';
import { snapDown, snapUp } from './lib/snap';

interface Props {
  scale: number;
  setScale: Dispatch<SetStateAction<number>>;
}

const MIN_SCALE = 50;
const MAX_SCALE = 500;
const SCALE_STEP = 25;

export const Scale = ({ scale, setScale }: Props) => {
  const [input, setInput] = useState('');

  useEffect(() => setInput(scale.toString(10)), [scale]);

  const submit = () => {
    const parsed = Number.parseInt(input, 10);

    if (Number.isNaN(parsed)) {
      return;
    }

    setScale(clamp(parsed, MIN_SCALE, MAX_SCALE));
  };

  const handleZoomIn = useCallback(
    (step: number) =>
      setScale((prev) => {
        const snapped = snapUp(prev, step, MAX_SCALE);
        setInput(snapped.toString(10));
        return snapped;
      }),
    [setScale],
  );

  const handleZoomOut = useCallback(
    (step: number) =>
      setScale((prev) => {
        const snapped = snapDown(prev, step, MIN_SCALE);
        setInput(snapped.toString(10));
        return snapped;
      }),
    [setScale],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        submit();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        setInput(scale.toString(10));
        break;
      case 'ArrowUp': {
        event.preventDefault();
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) {
          handleZoomIn(SCALE_STEP);
          break;
        }
        if (event.shiftKey) {
          handleZoomIn(10);
          break;
        }
        const newValue = clamp(scale + 1, MIN_SCALE, MAX_SCALE);
        setInput(newValue.toString(10));
        setScale(newValue);
        break;
      }
      case 'ArrowDown': {
        event.preventDefault();
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) {
          handleZoomOut(SCALE_STEP);
          break;
        }
        if (event.shiftKey) {
          handleZoomOut(10);
          break;
        }
        const newValue = clamp(scale - 1, MIN_SCALE, MAX_SCALE);
        setInput(newValue.toString(10));
        setScale(newValue);
        break;
      }
    }
  };

  return (
    <HStack gap="space-4" wrap={false}>
      <Tooltip content="Zoom ut" placement="top" keys={[MOD_KEY_TEXT, Keys.Dash]} describesChild>
        <Button
          size="xsmall"
          variant="tertiary"
          onClick={() => handleZoomOut(SCALE_STEP)}
          data-color="neutral"
          icon={<ZoomMinusIcon aria-hidden />}
        />
      </Tooltip>

      <label className="whitespace-nowrap rounded border border-ax-border-neutral bg-ax-bg-input px-2 outline-ax-border-focus focus-within:outline-2">
        <input
          type="text"
          className="w-6 text-right text-sm focus:outline-none"
          value={input}
          onChange={({ target }) => setInput(target.value)}
          onBlur={submit}
          onKeyDown={onKeyDown}
        />
        <span className="ml-2">%</span>
      </label>

      <Tooltip content="Zoom inn" placement="top" keys={[MOD_KEY_TEXT, Keys.Plus]} describesChild>
        <Button
          size="xsmall"
          variant="tertiary"
          onClick={() => handleZoomIn(SCALE_STEP)}
          data-color="neutral"
          icon={<ZoomPlusIcon aria-hidden />}
        />
      </Tooltip>
    </HStack>
  );
};
