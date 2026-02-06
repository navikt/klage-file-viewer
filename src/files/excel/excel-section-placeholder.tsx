import { BodyShort } from '@navikt/ds-react';
import { FileHeader } from '@/file-header/file-header';
import { ExcelPlaceholderTable } from '@/files/excel/excel-placeholder-table';

interface ExcelSectionPlaceholderProps {
  title: string;
}

export const ExcelSectionPlaceholder = ({ title }: ExcelSectionPlaceholderProps) => (
  <>
    <FileHeader title={title} currentPage={null} numPages={null} isLoading={false} />

    <ExcelPlaceholderTable>
      <BodyShort>Venter på innlasting …</BodyShort>
    </ExcelPlaceholderTable>
  </>
);
