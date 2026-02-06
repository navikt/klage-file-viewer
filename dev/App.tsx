import { FileExcelIcon, FilePdfIcon, MoonIcon, SunIcon } from '@navikt/aksel-icons';
import { Alert, BodyShort, Box, Button, Chips, HStack, Label, Tag, Theme } from '@navikt/ds-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KlageFileViewer } from '../src/index';
import type { FileEntry } from '../src/types';

enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
}

const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
const excelWorkerSrc = new URL('../src/excel/excel-worker.ts', import.meta.url).href;

const PDF_EXTENSION_REGEX = /\.pdf$/i;
const EXCEL_EXTENSION_REGEX = /\.xlsx?$/i;

const FILES_QUERY_PARAM = 'files';

type FileType = 'pdf' | 'excel';

interface AvailableFile {
  filename: string;
  type: FileType;
}

const getFileType = (filename: string): FileType | null => {
  if (PDF_EXTENSION_REGEX.test(filename)) {
    return 'pdf';
  }

  if (EXCEL_EXTENSION_REGEX.test(filename)) {
    return 'excel';
  }

  return null;
};

const getFilenamesFromUrl = (): string[] | null => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(FILES_QUERY_PARAM);

  if (raw === null) {
    return null;
  }

  return raw
    .split(',')
    .map((s) => decodeURIComponent(s.trim()))
    .filter((s) => s.length > 0);
};

const buildQueryString = (filenames: Iterable<string>): string => {
  const encoded = Array.from(filenames)
    .map((f) => encodeURIComponent(f))
    .join(',');

  return `${FILES_QUERY_PARAM}=${encoded}`;
};

const buildNewTabUrl = (filenames: Iterable<string>): string => {
  const query = buildQueryString(filenames);

  return `${window.location.origin}${window.location.pathname}?${query}`;
};

const syncUrlToState = (selectedFilenames: Set<string>): void => {
  const query = buildQueryString(selectedFilenames);
  const newUrl = `${window.location.pathname}?${query}`;

  window.history.replaceState(null, '', newUrl);
};

const buildDownloadUrl = (filename: string): string => `/api/download?file=${encodeURIComponent(filename)}`;

const toFileEntry = (file: AvailableFile): FileEntry => {
  const newTab = { url: buildNewTabUrl([file.filename]), id: `new-tab-${file.filename}` };
  const downloadUrl = buildDownloadUrl(file.filename);

  if (file.type === 'excel') {
    return {
      type: 'excel',
      title: file.filename.replace(EXCEL_EXTENSION_REGEX, ''),
      url: `/${file.filename}`,
      downloadUrl,
      newTab,
    };
  }

  return {
    type: 'pdf',
    title: file.filename.replace(PDF_EXTENSION_REGEX, ''),
    url: `/${file.filename}`,
    downloadUrl,
    newTab,
  };
};

const getDisplayName = (file: AvailableFile): string =>
  file.type === 'excel'
    ? file.filename.replace(EXCEL_EXTENSION_REGEX, '')
    : file.filename.replace(PDF_EXTENSION_REGEX, '');

const FILE_TYPE_ICON: Record<FileType, React.ReactNode> = {
  pdf: <FilePdfIcon aria-hidden />,
  excel: <FileExcelIcon aria-hidden />,
};

const FILE_TYPE_TAG_COLOR: Record<FileType, 'danger' | 'success'> = {
  pdf: 'danger',
  excel: 'success',
};

const FILE_TYPE_LABEL: Record<FileType, string> = {
  pdf: 'PDF',
  excel: 'Excel',
};

const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const INITIAL_SYSTEM_THEME =
  hasMatchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeMode.Dark : ThemeMode.Light;

const App = () => {
  const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(INITIAL_SYSTEM_THEME);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === ThemeMode.Light ? ThemeMode.Dark : ThemeMode.Light));
  }, []);

  useEffect(() => {
    fetch('/api/files')
      .then((res) => res.json() as Promise<string[]>)
      .then((filenames) => {
        const files: AvailableFile[] = [];

        for (const filename of filenames) {
          const type = getFileType(filename);

          if (type !== null) {
            files.push({ filename, type });
          }
        }

        setAvailableFiles(files);

        const urlFilenames = getFilenamesFromUrl();

        if (urlFilenames !== null) {
          const availableSet = new Set(files.map((f) => f.filename));
          const filtered = urlFilenames.filter((f) => availableSet.has(f));
          setSelectedFilenames(new Set(filtered));
        } else {
          // Select all files by default.
          setSelectedFilenames(new Set(files.map((f) => f.filename)));
        }
      })
      .catch(() => {
        setError('Kunne ikke hente fillisten.');
      });
  }, []);

  useEffect(() => {
    if (availableFiles.length === 0) {
      return;
    }

    syncUrlToState(selectedFilenames);
  }, [selectedFilenames, availableFiles]);

  const toggleFile = useCallback((filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);

      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }

      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFilenames(new Set(availableFiles.map((f) => f.filename)));
  }, [availableFiles]);

  const selectNone = useCallback(() => {
    setSelectedFilenames(new Set());
  }, []);

  const selectByType = useCallback(
    (type: FileType) => {
      setSelectedFilenames(new Set(availableFiles.filter((f) => f.type === type).map((f) => f.filename)));
    },
    [availableFiles],
  );

  const files: FileEntry[] = availableFiles.filter((f) => selectedFilenames.has(f.filename)).map(toFileEntry);

  const allSelected = selectedFilenames.size === availableFiles.length;
  const noneSelected = selectedFilenames.size === 0;

  const pdfFiles = availableFiles.filter((f) => f.type === 'pdf');
  const excelFiles = availableFiles.filter((f) => f.type === 'excel');

  const onlyPdfSelected =
    pdfFiles.length > 0 &&
    selectedFilenames.size === pdfFiles.length &&
    pdfFiles.every((f) => selectedFilenames.has(f.filename));

  const onlyExcelSelected =
    excelFiles.length > 0 &&
    selectedFilenames.size === excelFiles.length &&
    excelFiles.every((f) => selectedFilenames.has(f.filename));

  const topLevelNewTab = useMemo(
    () => ({ url: buildNewTabUrl(selectedFilenames), id: 'klage-file-viewer-dev' }),
    [selectedFilenames],
  );

  return (
    <Theme theme={theme} hasBackground className="w-full">
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          gridTemplateColumns: '100%',
          height: '100vh',
          width: '100%',
        }}
      >
        <Box
          background="raised"
          borderColor="neutral-subtle"
          borderWidth="0 0 1 0"
          padding="space-2"
          paddingInline="space-4"
        >
          <HStack gap="space-4" align="center" wrap>
            <Label size="small">Filer:</Label>

            <Chips size="small">
              <Chips.Toggle selected={allSelected} onClick={selectAll}>
                Alle
              </Chips.Toggle>
              <Chips.Toggle selected={noneSelected} onClick={selectNone}>
                Ingen
              </Chips.Toggle>
              <Chips.Toggle selected={onlyPdfSelected} onClick={() => selectByType('pdf')}>
                Kun PDF
              </Chips.Toggle>
              <Chips.Toggle selected={onlyExcelSelected} onClick={() => selectByType('excel')}>
                Kun Excel
              </Chips.Toggle>
            </Chips>

            <div style={{ width: '1px', height: '24px', background: 'var(--a-border-divider)' }} />

            <HStack gap="space-2" align="center" wrap>
              {availableFiles.map((file) => (
                <Button
                  key={file.filename}
                  size="xsmall"
                  variant={selectedFilenames.has(file.filename) ? 'primary' : 'secondary'}
                  icon={FILE_TYPE_ICON[file.type]}
                  onClick={() => {
                    toggleFile(file.filename);
                  }}
                  title={file.filename}
                >
                  <HStack gap="space-1" align="center" wrap={false}>
                    <Tag size="xsmall" variant="strong" data-color={FILE_TYPE_TAG_COLOR[file.type]}>
                      {FILE_TYPE_LABEL[file.type]}
                    </Tag>
                    <span
                      style={{
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {getDisplayName(file)}
                    </span>
                  </HStack>
                </Button>
              ))}
            </HStack>

            <HStack gap="space-2" align="center" style={{ marginInlineStart: 'auto' }}>
              <BodyShort size="small" textColor="subtle">
                {selectedFilenames.size.toString(10)} / {availableFiles.length.toString(10)}{' '}
                {availableFiles.length === 1 ? 'fil' : 'filer'} valgt
              </BodyShort>

              <div style={{ width: '1px', height: '24px', background: 'var(--a-border-divider)' }} />

              <Button
                variant="tertiary"
                size="small"
                icon={theme === ThemeMode.Light ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
                onClick={toggleTheme}
              >
                {theme === ThemeMode.Light ? 'Lys' : 'Mørk'}
              </Button>
            </HStack>
          </HStack>
        </Box>

        {error !== null ? (
          <Box padding="space-6" style={{ display: 'flex', justifyContent: 'center' }}>
            <Alert variant="error" size="small">
              {error}
            </Alert>
          </Box>
        ) : noneSelected ? (
          <Box padding="space-6" style={{ display: 'flex', justifyContent: 'center' }}>
            <Alert variant="info" size="small">
              Ingen filer valgt. Velg én eller flere filer i verktøylinjen.
            </Alert>
          </Box>
        ) : files.length === 0 ? (
          <Box padding="space-6" style={{ display: 'flex', justifyContent: 'center' }}>
            <Alert variant="info" size="small">
              Ingen filer funnet. Legg PDF- eller Excel-filer i <code>dev/public/</code> og last siden på nytt.
            </Alert>
          </Box>
        ) : (
          <div
            style={{
              minHeight: 0,
              overflow: 'clip',
              display: 'flex',
              justifyContent: 'center',
            }}
            data-dev-app-wrapper
          >
            <KlageFileViewer
              files={files}
              workerSrc={workerSrc}
              excelWorkerSrc={excelWorkerSrc}
              newTab={topLevelNewTab}
              theme={theme}
              className="w-full"
            />
          </div>
        )}
      </div>
    </Theme>
  );
};

export { App };
