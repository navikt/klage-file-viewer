import type { AvailableItem, FileType } from '@dev/types';
import { ThemeMode } from '@dev/use-persisted-theme';
import {
  ExpandIcon,
  FileExcelIcon,
  FileImageIcon,
  FileJpegIcon,
  FileJsonIcon,
  FilePdfIcon,
  FilePngIcon,
  MoonIcon,
  ShrinkIcon,
  SunIcon,
} from '@navikt/aksel-icons';
import { BodyShort, Box, Button, HStack, Tag, ToggleGroup } from '@navikt/ds-react';

// --- UI constants ---

const FILE_TYPE_ICON: Record<FileType, React.ReactNode> = {
  PDF: <FilePdfIcon aria-hidden />,
  XLSX: <FileExcelIcon aria-hidden />,
  JPEG: <FileJpegIcon aria-hidden />,
  PNG: <FilePngIcon aria-hidden />,
  TIFF: <FileImageIcon aria-hidden />,
  JSON: <FileJsonIcon aria-hidden />,
};

const FILE_TYPE_TAG_COLOR: Record<FileType, 'danger' | 'success' | 'info' | 'neutral'> = {
  PDF: 'danger',
  XLSX: 'success',
  JPEG: 'info',
  PNG: 'info',
  TIFF: 'info',
  JSON: 'neutral',
};

const FILE_TYPE_LABEL: Record<FileType, string> = {
  PDF: 'PDF',
  XLSX: 'Excel',
  JPEG: 'JPEG',
  PNG: 'PNG',
  TIFF: 'TIFF',
  JSON: 'JSON',
};

const DOCUMENT_TAG_COLOR = 'info';

// --- Toolbar component ---

interface ToolbarProps {
  availableItems: AvailableItem[];
  selectedKeys: Set<string>;
  toggleItem: (key: string) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  standalone: boolean;
  toggleStandalone: () => void;
}

const Toolbar = ({
  availableItems,
  selectedKeys,
  toggleItem,
  theme,
  toggleTheme,
  standalone,
  toggleStandalone,
}: ToolbarProps) => (
  <Box background="raised" borderColor="neutral-subtle" borderWidth="0 0 1 0" padding="space-2" paddingInline="space-4">
    <HStack gap="space-4" align="center" wrap>
      <HStack gap="space-2" align="center" wrap>
        {availableItems.map((item) => (
          <Button
            key={item.key}
            size="xsmall"
            variant={selectedKeys.has(item.key) ? 'primary' : 'secondary'}
            icon={FILE_TYPE_ICON[item.fileType]}
            onClick={() => {
              toggleItem(item.key);
            }}
            title={item.isDocument ? `${item.displayName} (dokument med varianter)` : item.displayName}
          >
            <HStack gap="space-1" align="center" wrap={false}>
              {item.isDocument ? (
                <Tag size="xsmall" variant="strong" data-color={DOCUMENT_TAG_COLOR}>
                  Dok
                </Tag>
              ) : (
                <Tag size="xsmall" variant="strong" data-color={FILE_TYPE_TAG_COLOR[item.fileType]}>
                  {FILE_TYPE_LABEL[item.fileType]}
                </Tag>
              )}
              <span
                style={{
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.displayName}
              </span>
            </HStack>
          </Button>
        ))}
      </HStack>

      <HStack gap="space-2" align="center" style={{ marginInlineStart: 'auto' }}>
        <BodyShort size="small" textColor="subtle">
          {selectedKeys.size.toString(10)} / {availableItems.length.toString(10)}{' '}
          {availableItems.length === 1 ? 'fil' : 'filer'} valgt
        </BodyShort>

        <div style={{ width: '1px', height: '24px', background: 'var(--a-border-divider)' }} />

        <ToggleGroup onChange={toggleStandalone} value={standalone.toString()} size="small">
          <ToggleGroup.Item label="Standalone" value="true" icon={<ExpandIcon aria-hidden />} />
          <ToggleGroup.Item label="Innebygd" value="false" icon={<ShrinkIcon aria-hidden />} />
        </ToggleGroup>

        <div style={{ width: '1px', height: '24px', background: 'var(--a-border-divider)' }} />

        <ToggleGroup onChange={toggleTheme} size="small" value={theme}>
          <ToggleGroup.Item label="Lys" value={ThemeMode.Light} icon={<SunIcon aria-hidden />} />

          <ToggleGroup.Item label="Mørk" value={ThemeMode.Dark} icon={<MoonIcon aria-hidden />} />
        </ToggleGroup>
      </HStack>
    </HStack>
  </Box>
);

export { Toolbar };
