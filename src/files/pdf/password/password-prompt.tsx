import { PadlockLockedIcon } from '@navikt/aksel-icons';
import { BodyShort, Button, Heading, TextField, VStack } from '@navikt/ds-react';
import { useEffect, useRef, useState } from 'react';
import { PlaceholderWrapper } from '@/files/pdf/pdf-section-placeholder';
import { type PasswordState, PasswordStatus } from '@/files/pdf/use-pdf-document';

interface PasswordPromptProps {
  passwordState: PasswordState;
  onSubmitPassword: (password: string) => void;
  scale: number;
}

export const PasswordPrompt = ({ passwordState, onSubmitPassword, scale }: PasswordPromptProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isIncorrect = passwordState.status === PasswordStatus.INCORRECT;

  useEffect(() => {
    if (passwordState.status === PasswordStatus.INCORRECT) {
      setIsSubmitting(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [passwordState]);

  const handleUnlock = () => {
    if (inputValue.length === 0) {
      return;
    }

    setIsSubmitting(true);
    onSubmitPassword(inputValue);
  };

  const errorMessage = isIncorrect ? 'Feil passord. Prøv igjen.' : undefined;

  return (
    <PlaceholderWrapper scale={scale}>
      <VStack
        align="center"
        gap="space-24"
        className="rounded-lg border border-ax-border-neutral bg-ax-bg-default p-10 shadow-md"
      >
        <VStack align="center" gap="space-8">
          <PadlockLockedIcon aria-hidden fontSize="3rem" />
          <Heading size="small">Passordbeskyttet PDF</Heading>
          <BodyShort size="small">Skriv inn passordet for å åpne denne PDF-filen.</BodyShort>
        </VStack>

        <TextField
          ref={inputRef}
          label="Passord"
          type="password"
          size="small"
          className="w-full"
          autoComplete="off"
          autoCorrect="off"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          error={errorMessage}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleUnlock();
            }
          }}
        />

        <Button
          size="small"
          variant="primary"
          loading={isSubmitting && !isIncorrect}
          disabled={inputValue.length === 0}
          onClick={handleUnlock}
        >
          Lås opp
        </Button>
      </VStack>
    </PlaceholderWrapper>
  );
};
