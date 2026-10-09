import { FilePlusIcon, FileTextIcon, PasswordHiddenIcon } from '@navikt/aksel-icons';
import { Tag, ToggleGroup } from '@navikt/ds-react';
import type { ReactElement } from 'react';
import type { ResolvedVariant } from '@/file-header/variant-types';
import type { VariantFormat } from '@/types';

const VARIANT_ITEMS: Record<VariantFormat, { label: string; icon: ReactElement }> = {
  SLADDET: { label: 'Sladdet', icon: <PasswordHiddenIcon aria-hidden className="text-xl" /> },
  ARKIV: { label: 'Usladdet', icon: <FileTextIcon aria-hidden className="text-xl" /> },
  FULLVERSJON: { label: 'Fullversjon', icon: <FilePlusIcon aria-hidden className="text-xl" /> },
};

interface VariantSelectorProps {
  variant: ResolvedVariant;
}

export const VariantSelector = ({ variant }: VariantSelectorProps) => {
  const { format, selectableFormats, selectFormat } = variant;

  if (selectableFormats.length < 2) {
    return <VariantTag format={format} />;
  }

  const onChange = (value: string) => {
    const selected = selectableFormats.find((selectableFormat) => selectableFormat === value);

    if (selected !== undefined) {
      selectFormat(selected);
    }
  };

  return (
    <ToggleGroup size="small" data-color="neutral" value={format} onChange={onChange} aria-label="Velg variant">
      {selectableFormats.map((selectableFormat) => (
        <ToggleGroup.Item
          key={selectableFormat}
          value={selectableFormat}
          icon={VARIANT_ITEMS[selectableFormat].icon}
          label={VARIANT_ITEMS[selectableFormat].label}
          className="min-h-6 px-1.5 py-0.5"
        />
      ))}
    </ToggleGroup>
  );
};

/** Non-interactive tag shown when the user cannot choose between variants. */
const VariantTag = ({ format }: { format: VariantFormat }) => {
  switch (format) {
    case 'SLADDET':
      return (
        <Tag data-color="meta-purple" variant="strong" size="xsmall">
          Sladdet
        </Tag>
      );
    case 'FULLVERSJON':
      return (
        <Tag data-color="info" variant="strong" size="xsmall">
          Fullversjon
        </Tag>
      );
    case 'ARKIV':
      return null;
  }
};
