import { itemToFileEntry } from '@dev/file-items';
import { Toolbar } from '@dev/toolbar';
import { buildNewTabUrl } from '@dev/url-helpers';
import { useFileSelection } from '@dev/use-file-selection';
import { usePersistedStandalone } from '@dev/use-persisted-standalone';
import { usePersistedTheme } from '@dev/use-persisted-theme';
import { Alert, Box, Theme } from '@navikt/ds-react';
import { useMemo } from 'react';
import { KlageFileViewer } from '@/index';

const PDFIUM_WASM_URL = `${window.location.origin}/pdfium.wasm`;

const COMMON_PASSWORDS: string[] = ['passord'];

const App = () => {
  const { availableItems, selectedKeys, error, toggleItem } = useFileSelection();
  const [theme, toggleTheme] = usePersistedTheme();
  const [standalone, toggleStandalone] = usePersistedStandalone();

  const files = availableItems.filter((i) => selectedKeys.has(i.key)).map(itemToFileEntry);

  const noneSelected = selectedKeys.size === 0;

  const topLevelNewTabUrl = useMemo(() => buildNewTabUrl(selectedKeys), [selectedKeys]);

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
        <Toolbar
          availableItems={availableItems}
          selectedKeys={selectedKeys}
          toggleItem={toggleItem}
          theme={theme}
          toggleTheme={toggleTheme}
          standalone={standalone}
          toggleStandalone={toggleStandalone}
        />

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
              Ingen filer funnet. Legg PDF-, Excel-, bilde- eller JSON-filer i <code>dev/public/</code>, eller opprett
              mapper med <code>ARKIV.pdf</code> og/eller <code>SLADDET.pdf</code> for dokumentvarianter. Last siden på
              nytt.
            </Alert>
          </Box>
        ) : (
          <div
            style={{
              minHeight: 0,
              overflow: 'clip',
              display: 'flex',
              justifyContent: 'center',
              width: standalone ? '100%' : '50em',
              marginInline: standalone ? undefined : 'auto',
            }}
            data-dev-app-wrapper
          >
            <KlageFileViewer
              pdfiumWasmUrl={PDFIUM_WASM_URL}
              files={files}
              newTabUrl={topLevelNewTabUrl}
              theme={theme}
              commonPasswords={COMMON_PASSWORDS}
              standalone={standalone}
            />
          </div>
        )}
      </div>
    </Theme>
  );
};

export { App };
