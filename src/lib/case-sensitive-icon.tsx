/**
 * Inline "Aa" icon used as a case-sensitivity toggle indicator.
 * Replaces the external `@styled-icons/fluentui-system-regular` dependency.
 */
export const CaseSensitiveIcon = ({
  width = 20,
  'aria-hidden': ariaHidden,
}: {
  width?: number;
  'aria-hidden'?: boolean;
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={width}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden={ariaHidden}
  >
    <title>Skift mellom store og små bokstaver</title>
    <path d="M10.5 3.75a.75.75 0 0 1 .7.49l4.5 11.5a.75.75 0 0 1-1.4.52L13.06 13H7.94l-1.24 3.26a.75.75 0 1 1-1.4-.52l4.5-11.5a.75.75 0 0 1 .7-.49Zm0 2.8L8.51 11.5h3.98L10.5 6.55Z" />
    <path d="M19.5 10a3 3 0 0 0-3 3v1a3 3 0 1 0 6 0v-1a3 3 0 0 0-3-3Zm-1.5 3a1.5 1.5 0 1 1 3 0v1a1.5 1.5 0 0 1-3 0v-1Z" />
    <path d="M22.25 10a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5a.75.75 0 0 1 .75-.75Z" />
  </svg>
);
