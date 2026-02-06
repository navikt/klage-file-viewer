import { Loader, VStack } from '@navikt/ds-react';
import type { ReactNode } from 'react';
import { ExcelTable } from '@/files/excel/excel-table';
import type { Row } from '@/files/excel/excel-types';

const PLACEHOLDER_COLUMNS = 8;
const PLACEHOLDER_ROWS = 8;

const EMPTY_ROWS: Row[] = Array.from({ length: PLACEHOLDER_ROWS }, () =>
  Array.from({ length: PLACEHOLDER_COLUMNS }, () => ''),
);

interface ExcelPlaceholderTableProps {
  children?: ReactNode;
}

export const ExcelPlaceholderTable = ({ children }: ExcelPlaceholderTableProps) => (
  <div className="relative w-full">
    <ExcelTable sheetName=" " rows={EMPTY_ROWS} />

    <div className="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center bg-ax-bg-neutral-moderate/30">
      <VStack align="center" gap="space-8">
        <Loader size="3xlarge" />
        {children}
      </VStack>
    </div>
  </div>
);
