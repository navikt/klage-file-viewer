import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHighlightingEnabled } from '@/files/pdf/highlights/highlight-store';
import { useHighlightStatus } from '@/files/pdf/highlights/use-highlight-documents';
import { type RegisterOcrMarkerDocument, useOcrMarkerCapture } from '@/files/pdf/highlights/use-ocr-marker-capture';

interface MarkerModeContextValue {
  /** When `true`, every finished text selection becomes a persisted highlight. */
  markerMode: boolean;
  markerModeDisabled: boolean;
  toggleMarkerMode: () => void;
  exitMarkerMode: () => void;
  registerOcrDocument: RegisterOcrMarkerDocument;
}

const MarkerModeContext = createContext<MarkerModeContextValue>({
  markerMode: false,
  markerModeDisabled: true,
  toggleMarkerMode: () => undefined,
  exitMarkerMode: () => undefined,
  registerOcrDocument: () => () => undefined,
});

export const useMarkerMode = (): MarkerModeContextValue => useContext(MarkerModeContext);

/**
 * Marker mode is deliberately not persisted — every page load starts with it off.
 * It is always off until the accessible documents' highlights have loaded.
 */
export const MarkerModeProvider = ({ children }: { children: ReactNode }) => {
  const enabled = useHighlightingEnabled();
  const { isReady } = useHighlightStatus();
  const markerModeDisabled = !enabled || !isReady;
  const [markerModeSetting, setMarkerMode] = useState(false);
  const markerMode = !markerModeDisabled && markerModeSetting;
  const registerOcrDocument = useOcrMarkerCapture(markerMode);

  useEffect(() => {
    if (markerModeDisabled) {
      setMarkerMode(false);
    }
  }, [markerModeDisabled]);

  const toggleMarkerMode = useCallback(() => {
    setMarkerMode((previous) => !previous);
  }, []);

  const exitMarkerMode = useCallback(() => {
    setMarkerMode(false);
  }, []);

  const value = useMemo(
    () => ({ markerMode, markerModeDisabled, toggleMarkerMode, exitMarkerMode, registerOcrDocument }),
    [markerMode, markerModeDisabled, toggleMarkerMode, exitMarkerMode, registerOcrDocument],
  );

  return <MarkerModeContext.Provider value={value}>{children}</MarkerModeContext.Provider>;
};

const MarkerUnavailableContext = createContext(false);

/** `true` while marker mode is on and the current file cannot be highlighted. */
export const useMarkerUnavailable = (): boolean => useContext(MarkerUnavailableContext);

interface MarkerUnavailableProviderProps {
  /** Whether the file can be highlighted. */
  highlightable: boolean;
  children: ReactNode;
}

export const MarkerUnavailableProvider = ({ highlightable, children }: MarkerUnavailableProviderProps) => {
  const { markerMode } = useMarkerMode();

  return (
    <MarkerUnavailableContext.Provider value={markerMode && !highlightable}>
      {children}
    </MarkerUnavailableContext.Provider>
  );
};
