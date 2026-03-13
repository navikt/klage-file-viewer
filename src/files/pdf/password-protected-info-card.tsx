import { PadlockLockedFillIcon } from '@navikt/aksel-icons';
import { BodyShort, CopyButton, InfoCard, Tag, Tooltip } from '@navikt/ds-react';

interface PasswordProtectedInfoCardProps {
  password?: string;
}

export const PasswordProtectedInfoCard = ({ password }: PasswordProtectedInfoCardProps) => (
  <InfoCard data-color="danger" className="w-fit max-w-[198mm]" size="small">
    <InfoCard.Header icon={<PadlockLockedFillIcon aria-hidden />}>
      <InfoCard.Title>Passordbeskyttet dokument</InfoCard.Title>
    </InfoCard.Header>
    <InfoCard.Content>
      <BodyShort size="small" spacing>
        Dette dokumentet er passordbeskyttet. Du kan ikke bruke det som vedlegg.
      </BodyShort>

      <BodyShort size="small" spacing={password !== undefined}>
        Du må laste opp og arkivere en kopi av dokumentet som ikke er passordbeskyttet. Ta kontakt med Team Klage om du
        trenger hjelp.
      </BodyShort>

      {password !== undefined ? (
        <BodyShort size="small" className="flex flex-row items-center gap-1">
          <span>Passord:</span>

          <Tag variant="moderate" data-color="neutral" size="xsmall">
            {password}
          </Tag>

          <Tooltip content="Kopier passord">
            <CopyButton copyText={password} size="xsmall" title="Kopier passord" />
          </Tooltip>
        </BodyShort>
      ) : null}
    </InfoCard.Content>
  </InfoCard>
);
