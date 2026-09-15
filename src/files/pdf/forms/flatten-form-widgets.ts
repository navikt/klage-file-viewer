import type { PdfDocumentObject, PdfEngine, PdfPageObject, PdfWidgetAnnoObject } from '@embedpdf/models';
import { closeDocument, createFile, tryOpenDocument } from '@/files/pdf/use-pdf-document';

/** A widget annotation paired with the page it belongs to. */
interface PageWidget {
  page: PdfPageObject;
  widget: PdfWidgetAnnoObject;
}

/**
 * Produce a copy of the document where every AcroForm field value has been
 * merged into the page content, or `null` when that is not possible.
 *
 * PDFium keeps filled-in form values in the appearance stream of each widget
 * annotation, which lives outside the page content stream. The `FPDFText_*`
 * family only reads page content, so text selection, search, copy and word
 * boundaries are all blind to form values even though `FPDF_FFLDraw` renders
 * them correctly.
 *
 * Flattening a widget writes its appearance stream into the page content and
 * removes the annotation. PDFium does not re-parse a page that is already
 * loaded, so the document must be saved and reopened before the change is
 * visible to the text APIs — hence the working copy below.
 *
 * Only widget annotations are flattened; other annotation types are left
 * alone so the rendered output is unchanged.
 *
 * The document that is already open is probed for widgets first, so a PDF
 * without form fields never pays for a second copy of the file.
 *
 * Returns `null` when the document has no form fields, when nothing could be
 * flattened, or when any step fails. Callers keep the original document in
 * that case, so this is always a pure enhancement.
 */
export const flattenFormWidgets = async (
  engine: PdfEngine,
  doc: PdfDocumentObject,
  data: Blob,
  password: string | null,
  isCancelled: () => boolean,
): Promise<PdfDocumentObject | null> => {
  if (!(await hasWidgets(engine, doc, isCancelled))) {
    return null;
  }

  let workingDoc: PdfDocumentObject;

  try {
    workingDoc = await openCopy(engine, await data.arrayBuffer(), password);
  } catch {
    return null;
  }

  try {
    const widgets = await collectWidgets(engine, workingDoc, isCancelled);

    if (widgets.length === 0 || isCancelled()) {
      return null;
    }

    let flattened = 0;

    for (const { page, widget } of widgets) {
      if (isCancelled()) {
        return null;
      }

      const ok = await engine
        .flattenAnnotation(workingDoc, page, widget)
        .toPromise()
        .catch(() => false);

      if (ok) {
        flattened += 1;
      }
    }

    // Some widget types (radio groups, signature fields) refuse to flatten.
    // They keep rendering through the form-fill pass, so a partial result is
    // still worth using — but an empty one is not.
    if (flattened === 0 || isCancelled()) {
      return null;
    }

    const buffer = await engine.saveAsCopy(workingDoc).toPromise();

    if (isCancelled()) {
      return null;
    }

    return await openCopy(engine, buffer, password);
  } catch {
    return null;
  } finally {
    closeDocument(engine, workingDoc);
  }
};

const openCopy = (engine: PdfEngine, content: ArrayBuffer, password: string | null): Promise<PdfDocumentObject> =>
  password === null
    ? tryOpenDocument(engine, createFile(content))
    : tryOpenDocument(engine, createFile(content), password);

/**
 * Whether any page holds a widget annotation. Stops at the first one: a
 * document with fields goes on to flattening anyway.
 */
const hasWidgets = async (engine: PdfEngine, doc: PdfDocumentObject, isCancelled: () => boolean): Promise<boolean> => {
  for (const page of doc.pages) {
    if (isCancelled()) {
      return false;
    }

    const widgets = await pageWidgets(engine, doc, page);

    if (widgets.length > 0) {
      return true;
    }
  }

  return false;
};

/**
 * Collect every widget annotation in the document, in page order. Widgets have
 * to be read from the same document they are flattened in, so this runs on the
 * working copy even though the source has already been probed.
 */
const collectWidgets = async (
  engine: PdfEngine,
  doc: PdfDocumentObject,
  isCancelled: () => boolean,
): Promise<PageWidget[]> => {
  const widgets: PageWidget[] = [];

  for (const page of doc.pages) {
    if (isCancelled()) {
      return [];
    }

    for (const widget of await pageWidgets(engine, doc, page)) {
      widgets.push({ page, widget });
    }
  }

  return widgets;
};

/** The widget annotations on a single page; an empty list when the page cannot be read. */
const pageWidgets = (engine: PdfEngine, doc: PdfDocumentObject, page: PdfPageObject): Promise<PdfWidgetAnnoObject[]> =>
  engine
    .getPageAnnoWidgets(doc, page)
    .toPromise()
    .catch((): PdfWidgetAnnoObject[] => []);
