import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { useEffect, useState } from 'react';
import { flattenFormWidgets } from '@/files/pdf/forms/flatten-form-widgets';
import { closeDocument } from '@/files/pdf/use-pdf-document';

/** A flattened document together with the document it was derived from. */
interface FlattenedDocument {
  source: PdfDocumentObject;
  flattened: PdfDocumentObject;
}

/**
 * Return the document that text operations — selection, search, copy, word
 * boundaries — should read from.
 *
 * Documents with AcroForm fields are upgraded in the background to a copy
 * where the field values have been flattened into the page content, which is
 * what makes them selectable, searchable and copyable. See
 * {@link flattenFormWidgets} for why this is necessary.
 *
 * The upgrade is deliberately asynchronous: the original document is returned
 * immediately so text is available without delay, and the flattened copy is
 * swapped in once ready.
 *
 * Not safe to render from — flattening bakes each widget's stored `/AP` into
 * the page and drops the widget, which loses the value whenever that `/AP` is
 * stale or absent, as on `/NeedAppearances` forms.
 *
 * Documents without form fields are returned unchanged, and cost no more than
 * a scan of the open document for widget annotations.
 */
export const useFlattenedFormDocument = (
  engine: PdfEngine | null,
  doc: PdfDocumentObject | null,
  data: Blob | null,
  password: string | null,
): PdfDocumentObject | null => {
  const [result, setResult] = useState<FlattenedDocument | null>(null);

  useEffect(() => {
    if (engine === null || doc === null || data === null) {
      return;
    }

    let cancelled = false;
    let opened: PdfDocumentObject | null = null;

    const run = async () => {
      const flattened = await flattenFormWidgets(engine, doc, data, password, () => cancelled);

      if (flattened === null) {
        return;
      }

      if (cancelled) {
        closeDocument(engine, flattened);

        return;
      }

      opened = flattened;
      setResult({ source: doc, flattened });
    };

    void run();

    return () => {
      cancelled = true;
      setResult(null);

      if (opened !== null) {
        closeDocument(engine, opened);
        opened = null;
      }
    };
  }, [engine, doc, data, password]);

  // Pairing the flattened copy with its source guarantees we never hand out a
  // document belonging to a file that has since been replaced.
  return result !== null && result.source === doc ? result.flattened : doc;
};
