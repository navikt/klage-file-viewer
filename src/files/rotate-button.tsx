import { RotateLeftIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';

interface RotateButtonProps {
  pageNumber: number;
  onRotate: () => void;
}

export const RotateButton = ({ pageNumber, onRotate }: RotateButtonProps) => (
  <div className="absolute top-2 left-2 z-10">
    <Tooltip content="Roter til venstre / mot klokken" placement="right" describesChild>
      <Button
        type="button"
        size="xsmall"
        variant="primary"
        onClick={onRotate}
        data-color="neutral"
        icon={<RotateLeftIcon aria-hidden />}
        aria-label={`Roter side ${pageNumber.toString(10)} mot klokken`}
      />
    </Tooltip>
  </div>
);
