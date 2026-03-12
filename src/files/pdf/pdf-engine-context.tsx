import { usePdfiumEngine } from '@embedpdf/engines/react';
import type { PdfEngine } from '@embedpdf/models';
import { createContext, type ReactNode, useContext } from 'react';

interface PdfEngineContextValue {
  engine: PdfEngine | null;
  isLoading: boolean;
  error: Error | null;
}

const PdfEngineContext = createContext<PdfEngineContextValue>({
  engine: null,
  isLoading: true,
  error: null,
});

export const usePdfEngine = () => useContext(PdfEngineContext);

interface PdfEngineProviderProps {
  children: ReactNode;
}

export const PdfEngineProvider = ({ children }: PdfEngineProviderProps) => {
  const { engine, isLoading, error } = usePdfiumEngine();

  return <PdfEngineContext.Provider value={{ engine, isLoading, error }}>{children}</PdfEngineContext.Provider>;
};
