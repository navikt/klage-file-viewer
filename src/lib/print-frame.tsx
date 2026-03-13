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

/** Load a blob directly into the iframe (PDFs). */
const printDirect = (
  iframe: HTMLIFrameElement,
  urlRef: React.RefObject<string | null>,
  blob: Blob,
  mimeType: string,
) => {
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
};

/** Wrap an image in an HTML page that scales it to fit a single printed page. */
const printImage = (
  iframe: HTMLIFrameElement,
  urlRef: React.RefObject<string | null>,
  blob: Blob,
  mimeType: string,
) => {
  const imageUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @media print {
    @page { margin: 0; }
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  img {
    max-width: 100%;
    max-height: 100vh;
    object-fit: contain;
  }
</style>
</head>
<body>
  <img src="${imageUrl}" />
</body>
</html>`;

  const htmlUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  urlRef.current = htmlUrl;

  iframe.onload = () => {
    if (iframe.src === htmlUrl) {
      // Wait for the image inside the HTML page to finish loading.
      const img = iframe.contentDocument?.querySelector('img');

      const trigger = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        URL.revokeObjectURL(imageUrl);
      };

      if (img?.complete) {
        trigger();
      } else {
        img?.addEventListener('load', trigger, { once: true });
      }
    }
  };

  iframe.src = htmlUrl;
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

    // Clean up previous blob URLs.
    if (urlRef.current !== null) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    if (mimeType.startsWith('image/')) {
      printImage(iframe, urlRef, blob, mimeType);
    } else {
      printDirect(iframe, urlRef, blob, mimeType);
    }
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
