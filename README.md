# @navikt/klage-file-viewer

[![Latest version](https://img.shields.io/github/package-json/v/navikt/klage-file-viewer?label=Latest%20version&logo=npm)](https://github.com/navikt/klage-file-viewer/packages)

A reusable file viewer React component for Nav applications. Supports PDF (via [PDFium](https://github.com/embedpdf/pdfium)), Excel, image (JPEG, PNG, TIFF), and JSON files with zoom, rotation, search, lazy loading, and multi-document support. Unsupported file types are shown with a download fallback.

## Installation

```sh
bun add @navikt/klage-file-viewer
npm i @navikt/klage-file-viewer
```

### Peer dependencies

This package requires the following peer dependencies:

- `react` (^19)
- `react-dom` (^19)
- `@navikt/ds-react` (^8)
- `@navikt/ds-css` (^8)
- `@navikt/aksel-icons` (^8)

## Setup

Import the component styles in your CSS **after** `@navikt/ds-css`:

```css
@import "@navikt/ds-css";
@import "@navikt/klage-file-viewer/styles.css";
```

## Usage

```tsx
import { KlageFileViewer } from "@navikt/klage-file-viewer";

const MyComponent = () => (
  <KlageFileViewer
    theme="light"
    files={[
      {
        variants: "PDF",
        title: "My Document",
        url: "/api/documents/123.pdf",
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
    { variants: "PDF", title: "Vedtak", url: "/api/documents/1.pdf" },
    { variants: "PDF", title: "Klage", url: "/api/documents/2.pdf" },
    { variants: "XLSX", title: "Regnskap", url: "/api/documents/3.xlsx" },
  ]}
/>
```

### Close button

Provide `onClose` to show a close button in the toolbar:

```tsx
<KlageFileViewer
  theme="light"
  files={files}
  onClose={() => setShowViewer(false)}
/>
```

### Configuration

Pass configuration props directly to the component:

```tsx
<KlageFileViewer
  theme="light"
  files={files}
  commonPasswords={["secret123"]}
  onFetchError={({ url, status, body }) => {
    console.error(`Failed to fetch ${url}: ${status}`);
  }}
  errorComponent={({ refresh }) => (
    <Button onClick={refresh}>Prøv igjen</Button>
  )}
/>
```

## API

### `KlageFileViewer` props

| Prop              | Type                                           | Required | Description                                                                              |
| ----------------- | ---------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `files`           | `FileEntry[]`                                  | Yes      | List of files to render in sequence.                                                     |
| `theme`           | `'light' \| 'dark'`                            | Yes      | Light or dark theme mode.                                                                |
| `onClose`         | `() => void`                                   | No       | Shows a close button; called when clicked.                                               |
| `newTabUrl`       | `string \| null`                               | No       | Shows a link in the toolbar to open the document set in a new tab.                       |
| `className`       | `string`                                       | No       | Additional CSS class for the root element.                                               |
| `onFetchError`    | `(error: FetchErrorInfo) => void`              | No       | Called when a file fetch fails.                                                          |
| `errorComponent`  | `React.ComponentType<{ refresh: () => void }>` | No       | Component rendered inside the error alert.                                               |
| `commonPasswords` | `string[]`                                     | No       | Common passwords to automatically try when a PDF is password-protected.                  |
| `standalone`      | `boolean`                                      | No       | Shows all fit options (fit-to-width, fit-to-page) when `true`. Defaults to `false`.      |
| `traceName`       | `string`                                       | No       | Name used as `component.instance` on OpenTelemetry spans. Useful for differentiating multiple viewer instances. |
| `handleRef`       | `Ref<KlageFileViewerHandle>`                   | No       | Ref exposing `focus()`, `reloadFile()`, and `reloadAll()` methods to control the viewer. |

### `FileEntry`

A `FileEntry` represents one file in the viewer:

| Property      | Type                                                    | Required | Description                                                          |
| ------------- | ------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `variants`    | `FileVariant \| [FileVariant, FileVariant] \| FileType` | Yes      | Variant data for the file. Use `FileType` when file has no variants. |
| `title`       | `string`                                                | Yes      | Display title shown in the sticky header.                            |
| `url`         | `string`                                                | Yes      | File source URL.                                                     |
| `query`       | `Record<string, string>`                                | No       | Query parameters sent with the file request.                         |
| `newTabUrl`   | `string`                                                | No       | URL to open this file in a new tab.                                  |
| `downloadUrl` | `string`                                                | No       | Download URL for this file.                                          |

### `FileVariant`

| Property    | Type             | Required | Description                           |
| ----------- | ---------------- | -------- | ------------------------------------- |
| `filtype`   | `FileType`       | Yes      | File type for this variant.           |
| `hasAccess` | `boolean`        | Yes      | Whether the user has access.          |
| `format`    | `VariantFormat`  | Yes      | Variant format in the archive.        |
| `skjerming` | `Skjerming \| null` | Yes   | Shielding classification for variant. |

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
type VariantFormat = 'ARKIV' | 'SLADDET';
```

### `Skjerming`

```ts
type Skjerming = 'POL' | 'FEIL';
```

### `KlageFileViewerHandle`

Ref handle exposed via `handleRef`:

| Method             | Description                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `focus()`          | Moves focus to the viewer scroll container.                                                                |
| `reloadFile(url)`  | Re-fetches the file for the URL. Resolves to `true` if a matching file was found and reload was triggered. |
| `reloadAll()`      | Re-fetches all currently loaded files. Resolves to the number of refreshes triggered.                      |

### `ScaleSettings`

A standalone React component for rendering the initial scale mode settings UI. Can be embedded in external settings pages to let users configure the viewer's initial zoom behavior for files opened in a new tab.

```tsx
import { ScaleSettings } from "@navikt/klage-file-viewer";

const SettingsPage = () => (
  <section>
    <ScaleSettings />
  </section>
);
```

The selected mode and custom scale value are persisted to `localStorage` and applied when `standalone` is `true`.

## Exports

| Export path                            | Description                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@navikt/klage-file-viewer`            | `KlageFileViewer` component, `ScaleSettings` component, `KlageFileViewerProps`, `KlageFileViewerHandle`, `FileEntry`, `FileType`, `FileVariant`, `FileVariants`, `Skjerming`, `VariantFormat`, `FetchErrorInfo` |
| `@navikt/klage-file-viewer/styles.css` | Pre-built CSS (Tailwind + component styles)                                                                                                                                                           |

## Features

- **PDF & Excel**: Render PDF and Excel files in a unified viewer.
- **Images**: Render JPEG, PNG, and TIFF images inline with zoom support.
- **JSON**: Render JSON files as an interactive, collapsible tree with syntax highlighting.
- **Unsupported file types**: Unsupported file types are displayed with a download fallback.
- **Zoom**: Ctrl/Cmd + scroll wheel, toolbar buttons, or keyboard shortcuts (Cmd+Plus / Cmd+Minus).
- **Sizing options**: Toolbar buttons to fit height and reset to default size (125%). Fit-to-width and fit-to-page are available when `standalone` is `true`.
- **Rotation**: Per-page rotation with localStorage persistence (PDF only).
- **Search**: Ctrl/Cmd+F to search text across all PDF documents, with match highlighting and navigation.
- **Lazy loading**: Sections load progressively as the user scrolls.
- **Page virtualization**: PDF pages outside the viewport are replaced with lightweight placeholders to free canvas memory. Pages within one viewport-height above and below the visible area are pre-rendered for smooth scrolling.
- **Multi-document**: Render multiple files in sequence with a document counter.
- **Redacted/unredacted toggling**: When a file has two variants (`ARKIV` and `SLADDET`), a toggle button in the per-document header lets the user switch between the redacted and unredacted version. The preference is persisted to `sessionStorage`. When the user lacks access to the unredacted variant, a non-interactive "Sladdet" tag is shown instead.
- **Shielding tags**: Variants with a `skjerming` value display a colored tag in the document header — "Begrenset" (warning) for `POL` or "Slettes" (danger) for `FEIL`.
- **Password-protected PDFs**: Automatically try common passwords; prompt user for manual entry. Successfully used passwords are remembered in `localStorage` per file URL.
- **Keyboard navigation**: Cmd/Ctrl+Arrow Up/Down to navigate between pages; Cmd/Ctrl+Shift+Arrow Up/Down to navigate between documents.
- **Dark mode**: Color inversion setting for PDFs in dark mode, persisted to localStorage.
- **Smooth scrolling**: Configurable animated scrolling when navigating between pages and documents, persisted to localStorage.
- **Settings**: Toolbar settings modal (gear icon) to toggle color inversion, smooth scrolling, and configure initial scale mode (fit-to-screen, fit-to-height, fit-to-width, custom, or default) for files opened in a new tab.
- **Error handling**: Configurable error UI with reload and custom actions.

## Development

```sh
bun i
bun run build
bun test
bun typecheck
bun lint --fix
```
