import { RotateLeftIcon } from '@navikt/aksel-icons';
import { Button, Theme, Tooltip } from '@navikt/ds-react';
import { ThemeMode, useFileViewerConfig } from '@/context';

interface RotateButtonProps {
  pageNumber: number;
  onRotate: () => void;
}

export const RotateButton = ({ pageNumber, onRotate }: RotateButtonProps) => {
  const { invertColors, theme } = useFileViewerConfig();
  const isPageDark = invertColors && theme === ThemeMode.Dark;

  return (
    <Theme theme={isPageDark ? undefined : 'light'} className="absolute top-1 left-1 z-10">
      <Tooltip content="Roter til venstre / mot klokken" placement="right" describesChild>
        <Button
          type="button"
          size="xsmall"
          variant="tertiary"
          onClick={onRotate}
          data-color="neutral"
          icon={<RotateLeftIcon aria-hidden />}
          aria-label={`Roter side ${pageNumber.toString(10)} mot klokken`}
        />
      </Tooltip>
    </Theme>
  );
};
