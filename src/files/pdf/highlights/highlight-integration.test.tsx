import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileViewerProvider } from '@/context';
import { FileSection } from '@/file-section';
import { getHighlightsKey, mirrorAppliedHighlightChanges } from '@/files/pdf/highlights/highlight-storage';
import {
  HighlightStoreProvider,
  useHighlightingEnabled,
  useHighlightStore,
} from '@/files/pdf/highlights/highlight-store';
import type {
  HighlightChanges,
  HighlightStorage,
  HighlightStorageDocument,
  HighlightStorageDocumentHighlights,
  HighlightStorageListeners,
} from '@/files/pdf/highlights/storage-contract';
import type { NewHighlight, StoredHighlight } from '@/files/pdf/highlights/types';
import { useHighlightDocuments, useRegisterHighlightDocument } from '@/files/pdf/highlights/use-highlight-documents';
import type { OcrMarkerDocument } from '@/files/pdf/highlights/use-ocr-marker-capture';
import { usePersistedHighlights } from '@/files/pdf/highlights/use-persisted-highlights';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';
import { MarkerModeProvider, useMarkerMode } from '@/marker-mode-context';
import { HighlightsPanel } from '@/toolbar/highlights-panel';
import { MarkerModeToggle } from '@/toolbar/marker-mode-toggle';
import type { FileEntry } from '@/types';

afterEach(() => mock.restore());

describe('highlight document access', () => {
  it('only lists loaded highlights while the variant is accessible', async () => {
    await withDom(async ({ window }, root) => {
      const storage = createMemoryStorage([['FULLVERSJON', 'Restricted text']]);
      const render = async (hasAccess: boolean) => {
        await act(async () => {
          root.render(
            <FileViewerProvider theme="light" highlightStorage={storage}>
              <HighlightStoreProvider highlightable>
                <HighlightDocument hasAccess={hasAccess} format="FULLVERSJON" />
              </HighlightStoreProvider>
            </FileViewerProvider>,
          );
        });
      };

      await render(false);
      expect(window.document.body.textContent).toBe('');

      await render(true);
      expect(window.document.body.textContent).toBe('Restricted text');

      await render(false);
      expect(window.document.body.textContent).toBe('');
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  it('shows highlights from the snapshot before the persistence reader mounts', async () => {
    await withDom(async ({ window }, root) => {
      const storage = createMemoryStorage([['ARKIV', 'Stored text']], { snapshotOnSubscribe: false });
      await renderHighlightsWithReader(root, storage, false);
      expect(window.document.body.textContent).toBe('');
      await act(async () => storage.sendSnapshot());
      expect(window.document.body.textContent).toBe('Stored text');

      await renderHighlightsWithReader(root, storage, true);
      expect(window.document.querySelector('output[aria-label="Persisted highlights"]')?.textContent).toBe(
        'Stored text',
      );
      expect(storage.subscribe).toHaveBeenCalledTimes(1);
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  it('clears one document and then all remaining documents through the highlight list', async () => {
    await withDom(async ({ window }, root) => {
      const storage = createMemoryStorage([
        ['ARKIV', 'First text'],
        ['FULLVERSJON', 'Second text'],
      ]);
      await renderHighlightsPanel(root, storage, true);
      const button = getPanelButton(window.document);
      await act(async () => button.click());
      await clickHighlightEditor(window.document, 'Fjern alle markeringer i First');

      expect(window.document.body.textContent).not.toContain('First text');
      expect(window.document.body.textContent).toContain('Second text');
      expect(window.document.activeElement).toBe(button);

      const clearAll = Array.from(window.document.querySelectorAll('button')).find(
        ({ textContent }) => textContent === 'Fjern alle',
      );

      if (clearAll === undefined) {
        throw new Error('Missing clear all highlights button');
      }

      await act(async () => clearAll.click());

      expect(window.document.body.textContent).not.toContain('Second text');
      expect(window.document.body.textContent).toContain('Ingen markeringer ennå');
      expect(window.document.activeElement).toBe(button);
      expect(storage.save.mock.calls).toEqual([
        [
          { id: '/document.pdf', format: 'ARKIV' },
          { added: [], removedIds: ['ARKIV'] },
        ],
        [
          { id: '/document.pdf', format: 'FULLVERSJON' },
          { added: [], removedIds: ['FULLVERSJON'] },
        ],
      ]);
    });
  });

  describe('incremental highlight storage', () => {
    it('mirrors applied batches without writing them back', async () => {
      await withDom(async ({ window }, root) => {
        const storage = createMemoryStorage([['ARKIV', 'Initial']]);
        await act(async () => {
          root.render(
            <FileViewerProvider theme="light" highlightStorage={storage}>
              <HighlightStoreProvider highlightable>
                <HighlightDocument hasAccess format="ARKIV" />
              </HighlightStoreProvider>
            </FileViewerProvider>,
          );
        });

        await act(async () => {
          storage.emit(
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [createStoredHighlight('external', 'External')], removedIds: [] },
          );
        });
        expect(window.document.body.textContent).toBe('Initial\nExternal');

        await act(async () => {
          storage.emit(
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [createStoredHighlight('replacement', 'Replacement')], removedIds: ['ARKIV', 'external'] },
          );
        });
        expect(window.document.body.textContent).toBe('Replacement');
        expect(storage.save).not.toHaveBeenCalled();
        expect(storage.subscribe).toHaveBeenCalledTimes(1);

        await act(async () => root.render(null));
        expect(storage.unsubscribe).toHaveBeenCalledTimes(1);
      });
    });

    it('enables highlighting and subscribes only while a highlightable file is shown', async () => {
      await withDom(async ({ window }, root) => {
        const storage = createMemoryStorage([]);
        const render = async (highlightable: boolean) => {
          await act(async () => {
            root.render(
              <FileViewerProvider theme="light" highlightStorage={storage}>
                <HighlightStoreProvider highlightable={highlightable}>
                  <HighlightingEnabledOutput />
                </HighlightStoreProvider>
              </FileViewerProvider>,
            );
          });
        };

        await render(false);
        expect(window.document.body.textContent).toBe('disabled');
        expect(storage.subscribe).not.toHaveBeenCalled();

        await render(true);
        expect(window.document.body.textContent).toBe('enabled');
        expect(storage.subscribe).toHaveBeenCalledTimes(1);

        await render(false);
        expect(window.document.body.textContent).toBe('disabled');
        expect(storage.unsubscribe).toHaveBeenCalledTimes(1);
      });
    });

    it('only shares changes reported through the storage subscription', async () => {
      await withDom(async ({ window }, root) => {
        const storage = createMemoryStorage([]);
        await renderHighlightEditors(root, storage);
        const document = { id: '/document.pdf', format: 'ARKIV' };

        await clickHighlightEditor(window.document, 'Add a');
        expect(getShownHighlights(window.document)).toEqual(['a', '']);
        await act(async () => storage.emit(document, { added: [createStoredHighlight('a')], removedIds: [] }));
        expect(getShownHighlights(window.document)).toEqual(['a', 'a']);

        await clickHighlightEditor(window.document, 'Add b');
        expect(getShownHighlights(window.document)).toEqual(['a', 'a\nb']);
        await act(async () => storage.emit(document, { added: [createStoredHighlight('b')], removedIds: [] }));
        expect(getShownHighlights(window.document)).toEqual(['a\nb', 'a\nb']);

        await clickHighlightEditor(window.document, 'Remove b');
        expect(getShownHighlights(window.document)).toEqual(['a\nb', 'a']);
        await act(async () => storage.emit(document, { added: [], removedIds: ['b'] }));
        expect(getShownHighlights(window.document)).toEqual(['a', 'a']);
        expect(storage.save.mock.calls).toEqual([
          [
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [createStoredHighlight('a')], removedIds: [] },
          ],
          [
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [createStoredHighlight('b')], removedIds: [] },
          ],
          [
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [], removedIds: ['b'] },
          ],
        ]);
      });
    });
  });
});

describe('files that cannot be highlighted', () => {
  it('are tagged and dimmed only while marker mode is on', async () => {
    await withDom(async ({ window }, root) => {
      await renderFileSections(root, [
        { title: 'Highlightable PDF', variants: 'PDF', highlightsId: '/document.pdf' },
        { title: 'PDF under work', variants: 'PDF' },
        { title: 'Image', variants: 'JPEG', highlightsId: '/image.jpg' },
        { title: 'XML', variants: 'XML', highlightsId: '/document.xml' },
      ]);

      expect(getUnavailableHeaders(window.document)).toEqual([false, false, false, false]);
      expect(getUnsupportedContent(window.document).className).not.toContain('opacity-40');

      await act(async () => getMarkerButton(window.document).click());
      expect(getUnavailableHeaders(window.document)).toEqual([false, true, true, true]);
      expect(getUnsupportedContent(window.document).className).toContain('opacity-40');

      await act(async () => getMarkerButton(window.document).click());
      expect(getUnavailableHeaders(window.document)).toEqual([false, false, false, false]);
    });
  });
});

describe('viewer OCR marker capture', () => {
  it('captures every selected page and document before clearing the selection once', async () => {
    await withDom(async (dom, root) => {
      const first = createOcrDocument(dom, ['Alpha', 'Bravo']);
      const second = createOcrDocument(dom, ['Charlie']);
      const listen = spyOn(dom.window.Document.prototype, 'addEventListener');
      await renderCaptureViewer(root, [first.registration, second.registration]);
      await toggleMarkerMode(dom.window.document);

      const selection = selectText(dom, first.firstText, second.lastText);
      const clear = spyOn(selection, 'removeAllRanges');
      releaseMouse(dom);

      expect(first.registration.addHighlights).toHaveBeenCalledTimes(1);
      expect(first.registration.addHighlights).toHaveBeenCalledWith([
        expect.objectContaining({ pageIndex: 0, text: 'Alpha' }),
        expect.objectContaining({ pageIndex: 1, text: 'Bravo' }),
      ]);
      expect(second.registration.addHighlights).toHaveBeenCalledWith([
        expect.objectContaining({ pageIndex: 0, text: 'Charlie' }),
      ]);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(selection.rangeCount).toBe(0);
      expect(listen.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1);
    });
  });

  describe('highlight list loading feedback', () => {
    it('keeps the list button usable while loading, then shows the loaded empty state', async () => {
      await withDom(async ({ window }, root) => {
        const storage = createMemoryStorage([], { snapshotOnSubscribe: false });
        await renderHighlightsPanel(root, storage);
        const button = getPanelButton(window.document);

        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(button.getAttribute('title')).toContain('Laster markeringer');
        expect(button.querySelector('.aksel-loader--small')).not.toBeNull();
        expect(button.disabled).toBe(false);
        const markerButton = getMarkerButton(window.document);
        expect(markerButton.disabled).toBe(true);
        await act(async () => markerButton.click());
        expect(markerButton.getAttribute('aria-pressed')).toBe('false');
        await act(async () => button.click());
        expect(window.document.querySelector('[role="status"] p')?.textContent).toBe('Laster markeringer…');
        expect(window.document.body.textContent).not.toContain('Ingen markeringer ennå');

        await act(async () => storage.sendSnapshot());

        expect(button.getAttribute('aria-busy')).toBe('false');
        expect(button.querySelector('.aksel-loader')).toBeNull();
        expect(window.document.body.textContent).toContain('Ingen markeringer ennå');
        expect(window.document.querySelector('[role="status"]')).toBeNull();
        expect(markerButton.disabled).toBe(false);
        expect(markerButton.getAttribute('aria-pressed')).toBe('false');
        await act(async () => markerButton.click());
        expect(markerButton.getAttribute('aria-pressed')).toBe('true');
      });
    });

    it('shows a save warning and saves the failed changes again from the popover', async () => {
      await withDom(async ({ window }, root) => {
        const storage = createMemoryStorage([['ARKIV', 'Saved']]);
        storage.save.mockImplementationOnce(async () => {
          throw new Error('Offline');
        });
        const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
        await renderHighlightsPanel(root, storage);
        const button = getPanelButton(window.document);
        await act(async () => button.click());
        await act(async () => getButtonByText(window.document, 'Fjern alle').click());

        expect(button.getAttribute('data-color')).toBe('warning');
        expect(button.getAttribute('title')).toContain('markeringene kunne ikke lagres');
        expect(window.document.body.textContent).toContain('Markeringene kunne ikke lagres');

        await act(async () => getButtonByText(window.document, 'Prøv igjen').click());

        expect(storage.save.mock.calls).toEqual([
          [
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [], removedIds: ['ARKIV'] },
          ],
          [
            { id: '/document.pdf', format: 'ARKIV' },
            { added: [], removedIds: ['ARKIV'] },
          ],
        ]);
        expect(button.getAttribute('data-color')).toBe('neutral');
        expect(window.document.body.textContent).not.toContain('Markeringene kunne ikke lagres');
        expect(window.document.activeElement).toBe(button);
        warn.mockRestore();
      });
    });
  });

  it('leaves selections alone when marker mode is off or the release is not a left click', async () => {
    await withDom(async (dom, root) => {
      const ocr = createOcrDocument(dom, ['Alpha']);
      await renderCaptureViewer(root, [ocr.registration]);
      const selection = selectText(dom, ocr.firstText, ocr.lastText);

      releaseMouse(dom);
      expect(ocr.registration.addHighlights).not.toHaveBeenCalled();
      expect(selection.toString()).toBe('Alpha');

      await toggleMarkerMode(dom.window.document);
      releaseMouse(dom, 2);
      expect(ocr.registration.addHighlights).not.toHaveBeenCalled();
      expect(selection.toString()).toBe('Alpha');

      releaseMouse(dom);
      expect(ocr.registration.addHighlights).toHaveBeenCalledTimes(1);

      await toggleMarkerMode(dom.window.document);
      selectText(dom, ocr.firstText, ocr.lastText);
      releaseMouse(dom);
      expect(ocr.registration.addHighlights).toHaveBeenCalledTimes(1);
      expect(selection.toString()).toBe('Alpha');
    });
  });

  it('keeps marker mode off without highlight storage', async () => {
    await withDom(async (dom, root) => {
      const ocr = createOcrDocument(dom, ['Alpha']);
      await renderCaptureViewer(root, [ocr.registration], null);
      await toggleMarkerMode(dom.window.document);

      const selection = selectText(dom, ocr.firstText, ocr.lastText);
      releaseMouse(dom);

      expect(ocr.registration.addHighlights).not.toHaveBeenCalled();
      expect(selection.toString()).toBe('Alpha');
    });
  });

  it('turns marker mode off and disables highlighting when highlights close', async () => {
    await withDom(async ({ window }, root) => {
      const storage = createMemoryStorage([['ARKIV', 'Stored text']]);
      await renderHighlightsPanel(root, storage);
      const button = getMarkerButton(window.document);
      await act(async () => button.click());
      expect(button.getAttribute('aria-pressed')).toBe('true');

      await act(async () => storage.sendClosed());

      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(window.document.body.textContent).not.toContain('Stored text');
      // The toolbar hides the highlight controls.
      expect(window.document.querySelector('output')?.textContent).toBe('disabled');
    });
  });

  it('does not disable marker mode while changes are being saved', async () => {
    await withDom(async ({ window }, root) => {
      const gate = Promise.withResolvers<HighlightChanges>();
      const storage = {
        ...createMemoryStorage([]),
        save: mock(async (_document: HighlightStorageDocument, _changes: HighlightChanges) => gate.promise),
      };
      await act(async () => {
        root.render(
          <FileViewerProvider theme="light" highlightStorage={storage}>
            <HighlightStoreProvider highlightable>
              <MarkerModeProvider>
                <HighlightEditor name="a" />
                <MarkerModeToggle />
              </MarkerModeProvider>
            </HighlightStoreProvider>
          </FileViewerProvider>,
        );
      });
      const button = getMarkerButton(window.document);
      await act(async () => button.click());
      const add = window.document.querySelector('button[aria-label="Add a"]');

      if (!(add instanceof window.HTMLButtonElement)) {
        throw new Error('Missing add highlight button');
      }

      await act(async () => add.click());
      expect(storage.save).toHaveBeenCalledTimes(1);
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      await act(async () => gate.resolve({ added: [], removedIds: [] }));
    });
  });

  it('unregisters documents and removes the listener when the viewer unmounts', async () => {
    await withDom(async (dom, root) => {
      const first = createOcrDocument(dom, ['Alpha']);
      const second = createOcrDocument(dom, ['Bravo']);
      const listen = spyOn(dom.window.Document.prototype, 'addEventListener');
      const storage = createMemoryStorage([]);
      await renderCaptureViewer(root, [first.registration, second.registration], storage);
      await toggleMarkerMode(dom.window.document);
      await renderCaptureViewer(root, [second.registration], storage);

      const selection = selectText(dom, first.firstText, first.lastText);
      releaseMouse(dom);
      expect(first.registration.addHighlights).not.toHaveBeenCalled();
      expect(second.registration.addHighlights).not.toHaveBeenCalled();
      expect(selection.toString()).toBe('Alpha');

      selectText(dom, second.firstText, second.lastText);
      releaseMouse(dom);
      expect(second.registration.addHighlights).toHaveBeenCalledTimes(1);
      expect(listen.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1);

      await act(async () => root.render(null));
      selectText(dom, second.firstText, second.lastText);
      releaseMouse(dom);
      expect(second.registration.addHighlights).toHaveBeenCalledTimes(1);
      expect(selection.toString()).toBe('Bravo');
    });
  });
});

const renderHighlightsWithReader = async (root: Root, storage: HighlightStorage, showReader: boolean) => {
  await act(async () => {
    root.render(
      <FileViewerProvider theme="light" highlightStorage={storage}>
        <HighlightStoreProvider highlightable>
          <HighlightDocument hasAccess format="ARKIV" />
          {showReader ? <PersistedHighlightReader /> : null}
        </HighlightStoreProvider>
      </FileViewerProvider>,
    );
  });
};

const HighlightingEnabledOutput = () => <output>{useHighlightingEnabled() ? 'enabled' : 'disabled'}</output>;

const PersistedHighlightReader = () => {
  const { highlightsByPage } = usePersistedHighlights('/document.pdf', 'ARKIV');

  return (
    <output aria-label="Persisted highlights">
      {Array.from(highlightsByPage.values())
        .flat()
        .map(({ text }) => text)
        .join('\n')}
    </output>
  );
};

const renderHighlightEditors = async (root: Root, first: HighlightStorage, second: HighlightStorage = first) => {
  await act(async () => {
    root.render(
      [
        { name: 'a', storage: first },
        { name: 'b', storage: second },
      ].map(({ name, storage }) => (
        <FileViewerProvider key={name} theme="light" highlightStorage={storage}>
          <HighlightStoreProvider highlightable>
            <HighlightEditor name={name} />
          </HighlightStoreProvider>
        </FileViewerProvider>
      )),
    );
  });
};

const clickHighlightEditor = async (document: Document, label: string) => {
  const button = document.querySelector(`[aria-label="${label}"]`);
  const view = document.defaultView;

  if (view === null || !(button instanceof view.HTMLButtonElement)) {
    throw new Error('Missing highlight editor button');
  }

  await act(async () => button.click());
};

const getShownHighlights = (document: Document) =>
  Array.from(document.querySelectorAll('output'), ({ textContent }) => textContent);

const renderHighlightsPanel = async (root: Root, storage: HighlightStorage, secondAccessible = false) => {
  await act(async () => {
    root.render(
      <FileViewerProvider theme="light" highlightStorage={storage}>
        <HighlightStoreProvider highlightable>
          <MarkerModeProvider>
            <PanelDocuments secondAccessible={secondAccessible} />
            <MarkerModeToggle />
            <HighlightsPanel scrollContainerRef={{ current: null }} onNavigateToHighlight={() => undefined} />
            <HighlightingEnabledOutput />
          </MarkerModeProvider>
        </HighlightStoreProvider>
      </FileViewerProvider>,
    );
  });
};

const PanelDocuments = ({ secondAccessible }: { secondAccessible: boolean }) => {
  useRegisterHighlightDocument(0, 'First', { id: '/document.pdf', format: 'ARKIV', hasAccess: true });
  useRegisterHighlightDocument(1, 'Second', {
    id: '/document.pdf',
    format: 'FULLVERSJON',
    hasAccess: secondAccessible,
  });

  return null;
};

const getButtonByText = (document: Document, text: string): HTMLButtonElement => {
  const button = Array.from(document.querySelectorAll('button')).find(({ textContent }) => textContent === text);

  if (button === undefined) {
    throw new Error(`Missing button: ${text}`);
  }

  return button;
};

const getPanelButton = (document: Document): HTMLButtonElement => {
  const button = document.querySelector('button[aria-label="Markeringer"]');
  const view = document.defaultView;

  if (view === null || !(button instanceof view.HTMLButtonElement)) {
    throw new Error('Missing highlight panel button');
  }

  return button;
};

const getMarkerButton = (document: Document): HTMLButtonElement => {
  const button = document.querySelector('button[aria-label="Markeringstusj"]');
  const view = document.defaultView;

  if (view === null || !(button instanceof view.HTMLButtonElement)) {
    throw new Error('Missing marker mode button');
  }

  return button;
};

const HighlightDocument = ({ hasAccess, format }: { hasAccess: boolean; format: string }) => {
  useRegisterHighlightDocument(0, 'Document', { id: '/document.pdf', format, hasAccess });
  const documents = useHighlightDocuments();

  return <output>{documents.flatMap(({ highlights }) => highlights.map(({ text }) => text)).join('\n')}</output>;
};

const HighlightEditor = ({ name }: { name: string }) => {
  const store = useHighlightStore();
  const key = getHighlightsKey({ id: '/document.pdf', format: 'ARKIV' });

  return (
    <>
      <HighlightDocument hasAccess format="ARKIV" />
      <button type="button" aria-label={`Add ${name}`} onClick={() => store.add(key, [createStoredHighlight(name)])}>
        Add
      </button>
      <button type="button" aria-label={`Remove ${name}`} onClick={() => store.remove(key, name)}>
        Remove
      </button>
    </>
  );
};

const CaptureDocuments = ({ documents }: { documents: OcrMarkerDocument[] }) => {
  const { registerOcrDocument } = useMarkerMode();
  useRegisterHighlightDocument(0, 'OCR document', {
    id: '/capture.pdf',
    format: undefined,
    hasAccess: documents.length > 0,
  });

  useEffect(() => {
    const unregister = documents.map(registerOcrDocument);

    return () => {
      for (const remove of unregister) {
        remove();
      }
    };
  }, [documents, registerOcrDocument]);

  return <MarkerModeToggle />;
};

/** Pass `null` to render the viewer without highlight storage. */
const renderCaptureViewer = async (
  root: Root,
  documents: OcrMarkerDocument[],
  storage: HighlightStorage | null = createMemoryStorage([]),
) => {
  await act(async () => {
    root.render(
      <FileViewerProvider theme="light" highlightStorage={storage === null ? undefined : storage}>
        <HighlightStoreProvider highlightable>
          <MarkerModeProvider>
            <CaptureDocuments documents={documents} />
          </MarkerModeProvider>
        </HighlightStoreProvider>
      </FileViewerProvider>,
    );
  });
};

const renderFileSections = async (root: Root, files: Omit<FileEntry, 'url'>[]) => {
  await act(async () => {
    root.render(
      <FileViewerProvider theme="light" highlightStorage={createMemoryStorage([])}>
        <HighlightStoreProvider highlightable>
          <MarkerModeProvider>
            <MarkerModeToggle />
            {files.map((file, index) => (
              <FileSection
                key={file.title}
                file={{ ...file, url: `/${file.title}` }}
                index={index}
                scale={100}
                scrollContainerRef={{ current: null }}
                shouldLoad={false}
                onPageCountReady={() => undefined}
              />
            ))}
          </MarkerModeProvider>
        </HighlightStoreProvider>
      </FileViewerProvider>,
    );
  });
};

/** Whether each file header, in order, shows that the file cannot be highlighted. */
const getUnavailableHeaders = (document: Document) =>
  Array.from(document.querySelectorAll('[data-klage-file-viewer-file-header]'), ({ textContent }) =>
    textContent.includes('Kan ikke markeres'),
  );

const getUnsupportedContent = (document: Document): Element => {
  const message = Array.from(document.querySelectorAll('p')).find(({ textContent }) =>
    textContent.includes('kan ikke forhåndsvises'),
  );

  if (message?.parentElement === null || message?.parentElement === undefined) {
    throw new Error('Missing unsupported file content');
  }

  return message.parentElement;
};

const toggleMarkerMode = async (document: Document) => {
  await act(async () => {
    const button = document.querySelector('button');

    if (button === null) {
      throw new Error('Missing marker toggle');
    }

    button.click();
  });
};

/**
 * In-memory highlight storage for `/document.pdf`, seeded with one highlight per variant format.
 * Applies changes as they are, and only reports changes passed to `emit`.
 * Sends a snapshot on subscribe, unless `snapshotOnSubscribe` is `false`; then `sendSnapshot` sends it.
 */
const createMemoryStorage = (seed: [format: string, text: string][], { snapshotOnSubscribe = true } = {}) => {
  const subscribers = new Set<HighlightStorageListeners>();
  const removedIds = new Set<string>();
  const values = new Map(
    seed.map(([format, text]): [string, { document: HighlightStorageDocument; highlights: StoredHighlight[] }] => {
      const document = { id: '/document.pdf', format };

      return [getHighlightsKey(document), { document, highlights: [createStoredHighlight(format, text)] }];
    }),
  );
  const apply = (document: HighlightStorageDocument, changes: HighlightChanges): HighlightChanges => {
    const key = getHighlightsKey(document);

    for (const id of changes.removedIds) {
      removedIds.add(id);
    }

    const highlights = mirrorAppliedHighlightChanges(values.get(key)?.highlights ?? [], changes.added, removedIds);
    values.set(key, { document, highlights });

    return changes;
  };
  const getSnapshot = (): HighlightStorageDocumentHighlights[] =>
    Array.from(values.values(), ({ document, highlights }) => ({ ...document, highlights }));
  const send = (notify: (listeners: HighlightStorageListeners) => void) => {
    for (const listeners of subscribers) {
      notify(listeners);
    }
  };
  const unsubscribe = mock((listeners: HighlightStorageListeners) => {
    subscribers.delete(listeners);
  });

  return {
    save: mock(async (document: HighlightStorageDocument, changes: HighlightChanges) => apply(document, changes)),
    subscribe: mock((listeners: HighlightStorageListeners) => {
      subscribers.add(listeners);

      if (snapshotOnSubscribe) {
        listeners.snapshot(getSnapshot());
      }

      return () => unsubscribe(listeners);
    }),
    unsubscribe,
    sendSnapshot: () => send((listeners) => listeners.snapshot(getSnapshot())),
    sendClosed: () => send((listeners) => listeners.closed()),
    /** Apply changes as another viewer, and report them. */
    emit: (document: HighlightStorageDocument, changes: HighlightChanges) => {
      apply(document, changes);
      send((listeners) => listeners.added(document, changes.added));
      send((listeners) => listeners.removed(document, changes.removedIds));
    },
  };
};

/** Every ID gets its own line, so the highlights never cover each other. */
const lines = new Map<string, number>();

const lineOf = (id: string): number => lines.get(id) ?? lines.set(id, lines.size).size - 1;

const createStoredHighlight = (id: string, text: string = id): StoredHighlight => ({
  id,
  pageIndex: 0,
  source: 'pdf',
  rects: [{ x: 0.1, y: 0.01 + lineOf(id) * 0.03, width: 0.2, height: 0.02 }],
  text,
  createdAt: 0,
});

const createOcrDocument = (dom: JSDOM, texts: [string, ...string[]]) => {
  const { document } = dom.window;
  const pageElements = new Map<number, HTMLElement>();
  const words = new Map<number, OcrWord[]>();
  const nodes = texts.map((text, pageIndex) => {
    const page = document.createElement('div');
    const layer = document.createElement('div');
    const span = document.createElement('span');
    const node = document.createTextNode(text);
    layer.setAttribute('data-ocr-page-index', pageIndex.toString(10));
    span.setAttribute('data-ocr-word-index', '0');
    span.append(node, document.createTextNode('\n'));
    layer.append(span);
    page.append(layer);
    document.body.append(page);
    pageElements.set(pageIndex + 1, page);
    words.set(pageIndex, [
      { text, x: 0.1, y: 0.1, width: 0.2, height: 0.02, lineY: 0.1, lineHeight: 0.02, endOfLine: true, confidence: 90 },
    ]);

    return node;
  });
  const firstText = nodes[0];
  const lastText = nodes.at(-1);

  if (firstText === undefined || lastText === undefined) {
    throw new Error('Missing OCR text');
  }

  return {
    registration: {
      pageElementsRef: { current: pageElements },
      ocrWordsRegistry: { current: words },
      addHighlights: mock((_highlights: NewHighlight[]) => undefined),
    },
    firstText,
    lastText,
  };
};

const selectText = (dom: JSDOM, start: Text, end: Text): Selection => {
  const selection = dom.window.getSelection();

  if (selection === null) {
    throw new Error('Missing native selection');
  }

  const range = dom.window.document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, end.length);
  selection.removeAllRanges();
  selection.addRange(range);

  return selection;
};

const releaseMouse = (dom: JSDOM, button = 0) => {
  // Dispatch outside the React root, like releasing a drag outside the viewer.
  dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('mouseup', { button, bubbles: true }));
};

const withDom = async (run: (dom: JSDOM, root: Root) => Promise<void>) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    Node: dom.window.Node,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.entries(globals).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

    return { key, descriptor };
  });
  const container = dom.window.document.getElementById('root');

  if (container === null) {
    throw new Error('Missing React root');
  }

  const root = createRoot(container);

  try {
    await run(dom, root);
  } finally {
    await act(async () => root.unmount());

    for (const { key, descriptor } of previous) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, key);
      } else {
        Object.defineProperty(globalThis, key, descriptor);
      }
    }

    dom.window.close();
  }
};
