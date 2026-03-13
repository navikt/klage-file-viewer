/**
 * Prints a Blob using a persistent hidden iframe, replicating the EmbedPDF
 * PrintFrame approach.
 *
 * Provides a React context so any component in the tree can trigger printing.
 * The iframe is mounted once and reused across print requests. The blob is
 * always re-wrapped with an explicit MIME type so the browser's PDF viewer
 * plugin activates correctly inside the iframe.
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

interface PrintContextValue {
  printBlob: (blob: Blob, mimeType: string) => void;
}

const PrintContext = createContext<PrintContextValue | null>(null);

export const usePrint = (): PrintContextValue => {
  const ctx = useContext(PrintContext);

  if (ctx === null) {
    throw new Error('usePrint must be used within a PrintProvider');
  }

  return ctx;
};

export const PrintProvider = ({ children }: { children: ReactNode }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Clean up blob URL on unmount.
  useEffect(() => {
    return () => {
      if (urlRef.current !== null) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, []);

  const printBlob = useCallback((blob: Blob, mimeType: string) => {
    const iframe = iframeRef.current;

    if (iframe === null) {
      return;
    }

    // Clean up previous blob URL.
    if (urlRef.current !== null) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    // Re-wrap with explicit MIME type so the browser activates the correct
    // viewer plugin (e.g. the PDF viewer) inside the iframe.
    const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
    urlRef.current = url;

    iframe.onload = () => {
      if (iframe.src === url) {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }
    };

    iframe.src = url;
  }, []);

  return (
    <PrintContext.Provider value={{ printBlob }}>
      {children}

      <iframe
        ref={iframeRef}
        style={{ position: 'absolute', display: 'none' }}
        title="Print Document"
        src="about:blank"
      />
    </PrintContext.Provider>
  );
};
