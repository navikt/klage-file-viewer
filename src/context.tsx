import { createContext, type ReactNode, useContext, useMemo } from 'react';

export interface FetchErrorInfo {
  url: string;
  status: number;
  body: string;
}

export interface PdfViewerConfig {
  /** Whether to invert colors (for dark mode). Default: `false` */
  invertColors: boolean;
  /** Called when a PDF fetch fails. */
  onFetchError?: (error: FetchErrorInfo) => void;
  /** Optional component rendered inside the error alert alongside the default reload button. */
  ErrorActions?: React.ComponentType<{ refresh: () => void }>;
}

const DEFAULT_CONFIG: PdfViewerConfig = {
  invertColors: false,
};

const PdfViewerConfigContext = createContext<PdfViewerConfig>(DEFAULT_CONFIG);

export const usePdfViewerConfig = (): PdfViewerConfig => useContext(PdfViewerConfigContext);

interface PdfViewerProviderProps {
  config?: Partial<PdfViewerConfig>;
  children: ReactNode;
}

export const PdfViewerProvider = ({ config, children }: PdfViewerProviderProps) => {
  const merged = useMemo<PdfViewerConfig>(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  return <PdfViewerConfigContext.Provider value={merged}>{children}</PdfViewerConfigContext.Provider>;
};
