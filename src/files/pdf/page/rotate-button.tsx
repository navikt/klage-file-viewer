interface RotateButtonProps {
  pageNumber: number;
  onRotate: () => void;
}

export const RotateButton = ({ pageNumber, onRotate }: RotateButtonProps) => (
  <button
    type="button"
    className="absolute top-2 left-2 z-10 cursor-pointer rounded border border-black/20 bg-white/85 px-1.5 py-1 text-base leading-none opacity-50 shadow-sm transition-opacity hover:opacity-100"
    onClick={onRotate}
    title="Roter mot klokken"
    aria-label={`Roter side ${pageNumber.toString(10)} mot klokken`}
  >
    ↺
  </button>
);
