# @navikt/klage-file-viewer

[![Latest version](https://img.shields.io/github/package-json/v/navikt/klage-file-viewer?label=Latest%20version&logo=npm)](https://github.com/navikt/klage-file-viewer/packages)

A reusable file viewer React component for Nav applications. Supports PDF (via [PDFium](https://github.com/embedpdf/pdfium)), Excel, image (JPEG, PNG, TIFF), and JSON files with zoom, rotation, search, lazy loading, and multi-document support. Unsupported file types are shown with a download fallback.

Only the latest Chromium and Microsoft Edge are supported.

## Installation

```sh
bun add @navikt/klage-file-viewer
npm i @navikt/klage-file-viewer
```

### Peer dependencies

This package requires the following peer dependencies:

- `react` (^19)
- `react-dom` (^19)
- `@navikt/ds-react` (^8.18)
- `@navikt/ds-css` (^8.18)
- `@navikt/aksel-icons` (^8)

## Setup

Import the component styles in your CSS **after** `@navikt/ds-css`:

```css
@import "@navikt/ds-css";
@import "@navikt/klage-file-viewer/styles.css";
```

### PDFium WASM

This library uses [PDFium](https://pdfium.googlesource.com/pdfium/) compiled to WebAssembly for PDF rendering. The WASM binary is hosted on the Nav CDN and loaded by default. You can override the URL via the optional `pdfiumWasmUrl` prop if you need to serve the binary from a different location.

## Usage

```tsx
import { KlageFileViewer } from '@navikt/klage-file-viewer';

const MyComponent = () => (
  <KlageFileViewer
    theme="light"
    files={[
      {
        variants: 'PDF',
        title: 'My Document',
        url: '/api/documents/123.pdf',
      },
    ]}
  />
);
```

### Multiple documents

Pass multiple entries to the `files` array to render them in sequence with a document counter in the toolbar:

```tsx
<KlageFileViewer
  theme="light"
  files={[
    { variants: 'PDF', title: 'Vedtak', url: '/api/documents/1.pdf' },
    { variants: 'PDF', title: 'Klage', url: '/api/documents/2.pdf' },
    { variants: 'XLSX', title: 'Regnskap', url: '/api/documents/3.xlsx' },
  ]}
/>;
```

### Close button

Provide `onClose` to show a close button in the toolbar:

```tsx
<KlageFileViewer theme="light" files={files} onClose={() => setShowViewer(false)} />;
```

### Configuration

Pass configuration props directly to the component:

```tsx
<KlageFileViewer
  theme="light"
  files={files}
  commonPasswords={['secret123']}
  onFetchError={(error) => {
    if (error.type === 'http') {
      console.error(`Failed to fetch ${error.url}: ${error.status}`, error.body);
    } else {
      console.error(`Network error fetching ${error.url}`, error.error);
    }
  }}
  errorComponent={({ refresh }) => <Button onClick={refresh}>Prøv igjen</Button>}
/>;
```

## API

### `KlageFileViewer` props

| Prop               | Type                                           | Required | Description                                                                                                                                                               |
| ------------------ | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`            | `FileEntry[]`                                  | Yes      | List of files to render in sequence.                                                                                                                                      |
| `pdfiumWasmUrl`    | `string`                                       | No       | URL to the PDFium WASM binary. Defaults to the Nav CDN-hosted version.                                                                                                    |
| `theme`            | `'light' \| 'dark'`                            | Yes      | Light or dark theme mode.                                                                                                                                                 |
| `onClose`          | `() => void`                                   | No       | Shows a close button; called when clicked.                                                                                                                                |
| `newTabUrl`        | `string \| null`                               | No       | Shows a link in the toolbar to open the document set in a new tab.                                                                                                        |
| `className`        | `string`                                       | No       | Additional CSS class for the root element.                                                                                                                                |
| `onFetchError`     | `(error: FetchErrorInfo) => void`              | No       | Called when a file fetch fails. See [`FetchErrorInfo`](#fetcherrorinfo).                                                                                                  |
| `highlightStorage` | `HighlightStorage`                             | No       | Where marker highlights are stored. Marker highlighting is unavailable without it, or when no PDF file has a `highlightsId`. See [`HighlightStorage`](#highlightstorage). |
| `errorComponent`   | `React.ComponentType<{ refresh: () => void }>` | No       | Component rendered inside the error alert.                                                                                                                                |
| `commonPasswords`  | `string[]`                                     | No       | Common passwords to automatically try when a PDF is password-protected.                                                                                                   |
| `standalone`       | `boolean`                                      | No       | Shows all fit options (fit-to-width, fit-to-page) when `true`. Defaults to `false`.                                                                                       |
| `traceName`        | `string`                                       | No       | Name used as `component.instance` on OpenTelemetry spans. Useful for differentiating multiple viewer instances.                                                           |
| `handleRef`        | `Ref<KlageFileViewerHandle>`                   | No       | Ref exposing `focus()`, `reloadFile()`, and `reloadAll()` methods to control the viewer.                                                                                  |

### `FileEntry`

A `FileEntry` represents one file in the viewer:

| Property       | Type                     | Required | Description                                                                                                                 |
| -------------- | ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `variants`     | `FileVariants`           | Yes      | Variant data for the file. Use `FileType` when file has no variants.                                                        |
| `title`        | `string`                 | Yes      | Display title shown in the sticky header.                                                                                   |
| `url`          | `string`                 | Yes      | File source URL.                                                                                                            |
| `query`        | `Record<string, string>` | No       | Query parameters sent with the file request.                                                                                |
| `newTabUrl`    | `string`                 | No       | URL to open this file in a new tab.                                                                                         |
| `downloadUrl`  | `string`                 | No       | Download URL for this file.                                                                                                 |
| `highlightsId` | `string`                 | No       | Identifies the file's marker highlights in [`highlightStorage`](#highlightstorage). Files without it cannot be highlighted. |

### `FileVariant`

| Property        | Type                | Required | Description                           |
| --------------- | ------------------- | -------- | ------------------------------------- |
| `filtype`       | `FileType`          | Yes      | File type for this variant.           |
| `hasAccess`     | `boolean`           | Yes      | Whether the user has access.          |
| `format`        | `VariantFormat`     | Yes      | Variant format in the archive.        |
| `skjerming`     | `Skjerming \| null` | Yes      | Shielding classification for variant. |
| `filstoerrelse` | `number`            | No       | File size in bytes.                   |

### `FileVariants`

```ts
type FileVariants = FileVariant | [FileVariant, FileVariant] | [FileVariant, FileVariant, FileVariant] | FileType;
```

### `FileType`

```ts
type FileType = 'PDF' | 'XLSX' | 'JPEG' | 'PNG' | 'TIFF' | 'JSON' | 'XML' | 'AXML' | 'DXML' | 'RTF';
```

- **`PDF`** — Rendered inline with full viewer support (zoom, rotation, search, lazy loading).
- **`XLSX`** — Rendered inline as an HTML table with sheet tabs.
- **`JPEG`, `PNG`, `TIFF`** — Rendered inline as images with zoom support.
- **`JSON`** — Rendered inline as a collapsible/expandable JSON tree.
- **All other types** (`XML`, `AXML`, `DXML`, `RTF`) — Shown as an `UnsupportedFileEntry` with a download button.

### `VariantFormat`

```ts
type VariantFormat = 'ARKIV' | 'SLADDET' | 'FULLVERSJON';
```

- **`ARKIV`** — The archived (unredacted) version.
- **`SLADDET`** — The redacted version.
- **`FULLVERSJON`** — The full version, which also contains question texts, help texts and unanswered questions from the application dialog.

### `Skjerming`

```ts
type Skjerming = 'POL' | 'FEIL';
```

### `FetchErrorInfo`

Passed to `onFetchError`. Discriminated on `type`:

```ts
type FetchErrorInfo =
  | { type: 'http'; url: string; status: number; body: string } // HttpFetchErrorInfo
  | { type: 'network'; url: string; error: Error }; // NetworkFetchErrorInfo
```

- **`http`** — The server responded with a non-2xx status code.
- **`network`** — The request failed without a usable HTTP response (network failure, CORS, invalid response headers, etc.). Browsers intentionally hide the underlying cause from JavaScript, so `error.message` is generic (e.g. `Failed to fetch`). The actual cause is only visible in the browser console.

### `HighlightStorage`

Stores marker highlights, e.g. in a backend. Without it, or when no PDF file has a `highlightsId`, the marker pen and the highlight list are hidden. Highlights are stored per document variant: the file's `highlightsId` and the variant format (`query.format`).

```ts
interface HighlightStorageDocument {
  id: string; // FileEntry.highlightsId
  format: string | undefined;
}

interface HighlightChanges {
  added: MarkerHighlight[];
  removedIds: string[];
}

interface HighlightStorageDocumentHighlights extends HighlightStorageDocument {
  highlights: MarkerHighlight[];
}

interface HighlightStorageListeners {
  snapshot: (documents: HighlightStorageDocumentHighlights[]) => void; // Every stored highlight. Documents left out have none.
  added: (document: HighlightStorageDocument, highlights: MarkerHighlight[]) => void;
  removed: (document: HighlightStorageDocument, highlightIds: string[]) => void;
  closed: () => void; // The highlights are deleted and can no longer change.
}

interface HighlightStorage {
  save: (document: HighlightStorageDocument, changes: HighlightChanges) => Promise<HighlightChanges>;
  subscribe: (listeners: HighlightStorageListeners) => () => void;
}
```

Highlights are never edited, and removal is permanent. Changes are idempotent and order-independent, so they can be retried and repeated.

- **`subscribe`** — Report the stored highlights of every document the viewer may show by calling the listener for each event. Start with a `snapshot`, or only `closed` when the highlights are closed. Then report every change, including the viewer's own, as `added` and `removed`. Send a new `snapshot` whenever changes may have been missed, such as after a reconnect. A snapshot replaces the stored highlights, and unsaved local changes stay on top. The marker pen stays disabled until the first snapshot. After `closed`, no highlights are shown and they cannot be changed. Keep the storage object stable (e.g. memoized), since a new object resets the viewer's highlight state.
- **`save`** — Apply the changes atomically and resolve with the changes that took effect. Saves are sent right away and can overlap. If `save` rejects, the changes stay visible as unsaved, with a "Prøv igjen" button. Reject with `HighlightStorageError` when retrying cannot help: `'closed'` closes the highlights, and `'too-large'` undoes the changes and shows a warning.

#### Storage servers

A shared API should apply changes with `applyHighlightChanges` from `@navikt/klage-file-viewer/highlights`, which is free of React and browser APIs. It keeps removed IDs, ignores additions covered by an existing highlight, and **deletes existing highlights covered by a new one** (their IDs are returned in `removedIds`). Store the result atomically, and return and publish the applied changes as `added` and `removed`:

```ts
import { applyHighlightChanges } from '@navikt/klage-file-viewer/highlights';

const { highlights, removedIds, changes } = applyHighlightChanges(stored?.highlights, stored?.removedIds, body);
```

All arguments are validated, and invalid parts are left out. Limit the request size, since valid highlights are stored as given.

#### HTTP adapter

`@navikt/klage-file-viewer/highlight-storage` implements `HighlightStorage` for such a server:

```ts
import { createEventSourceConnection, createHttpHighlightStorage } from '@navikt/klage-file-viewer/highlight-storage';

const highlightStorage = createHttpHighlightStorage({
  getUrl: ({ id, format }) => `/highlights/${id}${format === undefined ? '' : `?format=${encodeURIComponent(format)}`}`,
  connect: createEventSourceConnection(`/highlights/${caseId}/events`),
});
```

- `POST` takes changes and responds with the applied changes, `409` when the highlights are closed, or `413` when the changes are too large. Network errors and `5xx` responses are retried.
- The event stream sends `snapshot` with `{ documents: { id, format, highlights }[] }` on every (re)connect, then `added` with `{ id, format, highlights }` and `removed` with `{ id, format, highlightIds }`. A `null` format means no format. For closed highlights, it only sends `closed`, and the connection is closed so it is not reopened. Invalid highlights and documents are left out. Pass your own `connect` to use another event source. It gets one listener per event, `snapshot`, `added` and `removed` with the parsed JSON data, and `closed` without data.

```ts
interface MarkerHighlight {
  id: string;
  pageIndex: number; // Zero-based.
  source: 'pdf' | 'ocr'; // MarkerHighlightSource
  rects: MarkerHighlightRect[]; // One per visual line, as fractions (0–1) of the unrotated page.
  text: string;
  blocks?: MarkerHighlightBlock[]; // The text reflowed into paragraphs, lists and headings. Missing for OCR.
  createdAt: number; // Milliseconds since the epoch.
}

interface MarkerHighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MarkerHighlightBlock {
  kind: 'paragraph' | 'listItem' | 'heading';
  spans: MarkerHighlightSpan[];
  level: number; // List nesting level (1+) for `listItem`, otherwise 0.
  headingLevel: number; // 1–3 for `heading`, otherwise 0.
  gapBefore: boolean;
}

interface MarkerHighlightSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}
```

### `KlageFileViewerHandle`

Ref handle exposed via `handleRef`:

| Method            | Description                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `focus()`         | Moves focus to the viewer scroll container.                                                                |
| `reloadFile(url)` | Re-fetches the file for the URL. Resolves to `true` if a matching file was found and reload was triggered. |
| `reloadAll()`     | Re-fetches all currently loaded files. Resolves to the number of refreshes triggered.                      |

### `ScaleSettings`

A standalone React component for rendering the initial scale mode settings UI. Can be embedded in external settings pages to let users configure the viewer's initial zoom behavior for files opened in a new tab.

```tsx
import { ScaleSettings } from '@navikt/klage-file-viewer';

const SettingsPage = () => (
  <section>
    <ScaleSettings />
  </section>
);
```

The selected mode and custom scale value are persisted to `localStorage` and applied when `standalone` is `true`.

## Exports

| Export path                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@navikt/klage-file-viewer`                   | `KlageFileViewer` component, `ScaleSettings` component, `KlageFileViewerProps`, `KlageFileViewerHandle`, `FileEntry`, `FileType`, `FileVariant`, `FileVariants`, `Skjerming`, `VariantFormat`, `FetchErrorInfo`, `HttpFetchErrorInfo`, `NetworkFetchErrorInfo`, `HighlightChanges`, `HighlightStorage`, `HighlightStorageDocument`, `HighlightStorageDocumentHighlights`, `HighlightStorageError`, `HighlightStorageErrorReason`, `HighlightStorageListeners`, `MarkerHighlight`, `MarkerHighlightSource`, `MarkerHighlightRect`, `MarkerHighlightBlock`, `MarkerHighlightSpan` |
| `@navikt/klage-file-viewer/highlights`        | `applyHighlightChanges`, `AppliedHighlightChanges`, `validateHighlights`, `validateHighlightChanges`, `HighlightStorageError` and the highlight and storage types, for storage servers and adapters. Free of React and browser APIs.                                                                                                                                                                                                                                                                                                                                            |
| `@navikt/klage-file-viewer/highlight-storage` | `createHttpHighlightStorage` and `createEventSourceConnection`, an HTTP adapter for `HighlightStorage`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@navikt/klage-file-viewer/styles.css`        | Pre-built CSS (Tailwind + component styles)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Features

- **PDF & Excel**: Render PDF and Excel files in a unified viewer.
- **Images**: Render JPEG, PNG, and TIFF images inline with zoom support.
- **JSON**: Render JSON files as an interactive, collapsible tree with syntax highlighting.
- **Unsupported file types**: Unsupported file types are displayed with a download fallback.
- **Zoom**: Ctrl/Cmd + scroll wheel, toolbar buttons, or keyboard shortcuts (Cmd+Plus / Cmd+Minus).
- **Sizing options**: Toolbar buttons to fit height and reset to default size (125%). Fit-to-width and fit-to-page are available when `standalone` is `true`.
- **Rotation**: Per-page rotation with localStorage persistence (PDF only).
- **Search**: Ctrl/Cmd+F to search text across all PDF documents, with match highlighting and navigation.
- **Marker highlights**: A toolbar toggle turns on the marker pen for PDF text and OCR text in scanned PDFs. While it is on, every finished text selection becomes a yellow highlight, clicking a highlight removes it, and Escape turns it off. Files that cannot be highlighted are dimmed and tagged "Kan ikke markeres". The "Markeringer" button lists highlights by document; clicking one scrolls to it, and each can be copied or removed. Requires [`highlightStorage`](#highlightstorage) and at least one PDF file with a `highlightsId`.
- **Lazy loading**: Sections load progressively as the user scrolls.
- **Page virtualization**: PDF pages outside the viewport are replaced with lightweight placeholders to free canvas memory. Pages within one viewport-height above and below the visible area are pre-rendered for smooth scrolling.
- **Multi-document**: Render multiple files in sequence with a document counter.
- **Variant selection**: When a file has multiple accessible variants (`SLADDET`, `ARKIV` and/or `FULLVERSJON`), a toggle group with icons and labels in the per-document header lets the user choose between "Sladdet", "Standard" and "Fullversjon". The redacted variant is shown by default when available. If the selected variant is missing or inaccessible, the viewer falls back to `SLADDET`, then `ARKIV`, then `FULLVERSJON`. The selection is persisted to `sessionStorage`. When only one variant is accessible, a non-interactive "Sladdet" or "Fullversjon" tag is shown instead.
- **File size**: When the variant's `filstoerrelse` is provided, the download button tooltip shows the formatted file size (e.g. "Last ned (1,5 kB)").
- **Shielding tags**: Variants with a `skjerming` value display a colored tag in the document header — "Begrenset" (warning) for `POL` or "Slettes" (danger) for `FEIL`.
- **Password-protected PDFs**: Automatically try common passwords; prompt user for manual entry. Successfully used passwords are remembered in `localStorage` per file URL.
- **Keyboard navigation**: Cmd/Ctrl+Arrow Up/Down to navigate between pages; Cmd/Ctrl+Shift+Arrow Up/Down to navigate between documents.
- **Dark mode**: Color inversion setting for PDFs in dark mode, persisted to localStorage.
- **Smooth scrolling**: Configurable animated scrolling when navigating between pages and documents, persisted to localStorage.
- **Settings**: Toolbar settings modal (gear icon) to toggle color inversion, smooth scrolling, and configure initial scale mode (fit-to-screen, fit-to-height, fit-to-width, custom, or default) for files opened in a new tab.
- **Error handling**: Configurable error UI with reload and custom actions.

## Development

```sh
bun i --ignore-scripts
bun run build
bun test
bun typecheck
bun lint --fix
```
