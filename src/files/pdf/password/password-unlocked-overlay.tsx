import { PadlockLockedFillIcon } from '@navikt/aksel-icons';

export const PasswordUnlockedOverlay = () => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <PadlockLockedFillIcon
      aria-hidden
      className="text-ax-text-danger-decoration h-full max-h-1/2 w-full max-w-1/2 opacity-50"
    />
  </div>
);
