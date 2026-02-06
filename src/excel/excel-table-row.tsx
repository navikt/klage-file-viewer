import { memo } from 'react';
import type { Row } from 'read-excel-file';
import { ExcelTableCell } from '@/excel/excel-table-cell';

interface ExcelTableRowProps {
  row: Row;
  rowIndex: number;
}

export const ExcelTableRow = memo(({ row, rowIndex }: ExcelTableRowProps) => {
  return (
    <tr className="group/row odd:bg-ax-bg-default even:bg-ax-bg-neutral-moderate">
      <td className="sticky left-0 z-10 border border-ax-border-neutral bg-ax-bg-neutral-moderate px-2 py-1 text-center font-ax-bold text-ax-text-neutral-subtle">
        {(rowIndex + 1).toString(10)}
      </td>

      {row.map((cell, cellIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Cells have no stable id
        <ExcelTableCell key={cellIndex} value={cell} />
      ))}
    </tr>
  );
});

ExcelTableRow.displayName = 'ExcelTableRow';
