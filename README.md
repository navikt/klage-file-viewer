# @navikt/klage-file-viewer

[![Latest version](https://img.shields.io/github/package-json/v/navikt/klage-file-viewer?label=Latest%20version&logo=npm)](https://github.com/navikt/klage-file-viewer/packages)

A reusable file viewer React component for Nav applications. Supports PDF (via [PDF.js](https://mozilla.github.io/pdf.js/)) and Excel files with zoom, rotation, search, lazy loading, and multi-document support.

## Installation

```sh
npm i @navikt/klage-file-viewer
```

Since this is a private package published to the GitHub npm registry, you need to configure your `.npmrc`:

```
@navikt:registry=https://npm.pkg.github.com
```

### Peer dependencies

This package requires the following peer dependencies:

- `react` (^18 or ^19)
- `react-dom` (^18 or ^19)
- `@navikt/ds-react` (^8)
- `@navikt/ds-css` (^8)
- `@navikt/aksel-icons` (^8)

## Setup

### 1. CSS

Import the component styles in your CSS **after** `@navikt/ds-css`:

```css
@import "@navikt/ds-css";
@import "@navikt/klage-file-viewer/styles.css";
```

### 2. PDF.js worker

The PDF.js worker script must be served as a static asset. Copy it from the package to your public/static directory:

```sh
cp node_modules/@navikt/klage-file-viewer/dist/pdf-worker.min.mjs public/pdf-worker.min.mjs
```

Or reference it directly using your bundler's URL handling (e.g. in Vite):

```ts
const workerUrl = new URL(
  "@navikt/klage-file-viewer/pdf-worker",
  import.meta.url,
).href;
```

### 3. Excel worker (optional)

If you need Excel support, the Excel worker script must also be served as a static asset:

```sh
cp node_modules/@navikt/klage-file-viewer/dist/excel-worker.js public/excel-worker.js
```

Or reference it directly:

```ts
const excelWorkerUrl = new URL(
  "@navikt/klage-file-viewer/excel-worker",
  import.meta.url,
).href;
```

## Usage

```tsx
import { KlageFileViewer } from "@navikt/klage-file-viewer";

const MyComponent = () => (
  <KlageFileViewer
    workerSrc="/pdf-worker.min.mjs"
    files={[
      {
        type: "pdf",
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
  workerSrc="/pdf-worker.min.mjs"
  excelWorkerSrc="/excel-worker.js"
  files={[
    { type: "pdf", title: "Vedtak", url: "/api/documents/1.pdf" },
    { type: "pdf", title: "Klage", url: "/api/documents/2.pdf" },
    { type: "excel", title: "Regnskap", url: "/api/documents/3.xlsx" },
  ]}
/>
```

### Close button

Provide `onClose` to show a close button in the toolbar:

```tsx
<KlageFileViewer
  workerSrc="/pdf-worker.min.mjs"
  files={files}
  onClose={() => setShowViewer(false)}
/>
```

### Configuration

Pass configuration props directly to the component:

```tsx
<KlageFileViewer
  workerSrc="/pdf-worker.min.mjs"
  files={files}
  invertColors={true}
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

| Prop             | Type                                           | Required | Description                                                                  |
| ---------------- | ---------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `files`          | `FileEntry[]`                                  | Yes      | List of files to render in sequence.                                         |
| `workerSrc`      | `string`                                       | No       | URL to the PDF.js worker script. Required when any file has `type: 'pdf'`.   |
| `excelWorkerSrc` | `string`                                       | No       | URL to the Excel worker script. Required when any file has `type: 'excel'`.  |
| `onClose`        | `() => void`                                   | No       | Shows a close button; called when clicked.                                   |
| `newTab`         | `NewTabProps \| null`                           | No       | Shows a link in the toolbar to open the document set in a new tab.           |
| `theme`          | `ThemeMode`                                    | No       | Explicit light/dark theme mode.                                              |
| `className`      | `string`                                       | No       | Additional CSS class for the root element.                                   |
| `invertColors`   | `boolean`                                      | No       | Invert file colors (for dark mode). Defaults to `true`.                      |
| `onFetchError`   | `(error: FetchErrorInfo) => void`              | No       | Called when a file fetch fails.                                              |
| `errorComponent` | `React.ComponentType<{ refresh: () => void }>` | No       | Component rendered inside the error alert.                                   |

### `FileEntry`

A discriminated union of `PdfFileEntry` and `ExcelFileEntry`:

| Property      | Type                     | Required | Description                                          |
| ------------- | ------------------------ | -------- | ---------------------------------------------------- |
| `type`        | `'pdf' \| 'excel'`      | Yes      | File type discriminator.                             |
| `title`       | `string`                 | Yes      | Display title shown in the sticky header.            |
| `url`         | `string`                 | Yes      | File source URL.                                     |
| `query`       | `Record<string, string>` | No       | Query parameters sent with the file request.         |
| `newTab`      | `NewTabProps`            | No       | Adds an "open in new tab" button to the header.      |
| `downloadUrl` | `string`                 | No       | Download URL for this file.                          |
| `headerExtra` | `React.ReactNode`        | No       | Extra content rendered in the sticky header.         |

### `NewTabProps`

| Property | Type     | Required | Description                    |
| -------- | -------- | -------- | ------------------------------ |
| `url`    | `string` | Yes      | URL to open in the new tab.    |
| `id`     | `string` | Yes      | Unique identifier for the tab. |

## Exports

| Export path                              | Description                                    |
| ---------------------------------------- | ---------------------------------------------- |
| `@navikt/klage-file-viewer`              | `KlageFileViewer` component + types            |
| `@navikt/klage-file-viewer/styles.css`   | Pre-built CSS (Tailwind + PDF.js text layer)   |
| `@navikt/klage-file-viewer/pdf-worker`   | PDF.js worker script                           |
| `@navikt/klage-file-viewer/excel-worker` | Excel worker script                            |

## Features

- **PDF & Excel**: Render PDF and Excel files in a unified viewer.
- **Zoom**: Ctrl/Cmd + scroll wheel, toolbar buttons, or keyboard shortcuts (Cmd+Plus / Cmd+Minus).
- **Fit to height**: One-click button to scale the current page to fit the viewport.
- **Rotation**: Per-page rotation with localStorage persistence (PDF only).
- **Search**: Ctrl/Cmd+F to search text within a single-document PDF view, with match highlighting and navigation.
- **Lazy loading**: Sections load progressively as the user scrolls.
- **Multi-document**: Render multiple files in sequence with a document counter.
- **Error handling**: Configurable error UI with reload and custom actions.

## Development

```sh
bun install
bun run build
bun test
bun run typecheck
bun run lint
```
