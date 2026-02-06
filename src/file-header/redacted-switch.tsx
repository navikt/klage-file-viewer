import { EyeIcon, EyeObfuscatedIcon } from '@navikt/aksel-icons';
import { Button, Tag, Tooltip } from '@navikt/ds-react';

interface RedactedSwitchProps {
  hasRedactedDocuments: boolean;
  hasAccessToArchivedDocuments: boolean;
  showRedacted: boolean;
  setShowRedacted: (showRedacted: boolean) => void;
}

export const RedactedSwitch = (props: RedactedSwitchProps) => {
  if (!props.hasRedactedDocuments) {
    return null;
  }

  if (!props.hasAccessToArchivedDocuments) {
    return (
      <Tooltip content="Du har ikke tilgang til å se usladdet versjon" placement="top">
        <Tag data-color="meta-purple" variant="strong" size="xsmall">
          Sladdet
        </Tag>
      </Tooltip>
    );
  }

  const { showRedacted, setShowRedacted } = props;

  return (
    <Button
      role="checkbox"
      size="xsmall"
      variant={showRedacted ? 'primary' : 'secondary'}
      data-color="neutral"
      aria-checked={showRedacted}
      type="button"
      onClick={() => setShowRedacted(!showRedacted)}
      icon={showRedacted ? <EyeObfuscatedIcon aria-hidden /> : <EyeIcon aria-hidden />}
    >
      {showRedacted ? 'Sladdet' : 'Usladdet'}
    </Button>
  );
};
