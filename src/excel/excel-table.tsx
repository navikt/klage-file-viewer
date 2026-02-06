import { memo } from 'react';
import type { Row } from 'read-excel-file';
import { ExcelSheetHeader } from '@/excel/excel-sheet-header';
import { ExcelTableRow } from '@/excel/excel-table-row';

interface ExcelTableProps {
  sheetName: string;
  rows: Row[];
}

export const ExcelTable = memo(({ sheetName, rows }: ExcelTableProps) => {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnLabels = Array.from({ length: columnCount }, (_, i) => columnIndexToLabel(i));

  return (
    <div className="overflow-hidden rounded-lg bg-ax-bg-default shadow-ax-dialog">
      <ExcelSheetHeader sheetName={sheetName} />

      {rows.length === 0 ? (
        <p className="p-4 text-center text-ax-text-neutral-subtle">Arket er tomt</p>
      ) : (
        <div className="p-2">
          <div className="overflow-x-auto">
            <table className="min-w-fit border-collapse text-sm">
              <thead>
                <tr>
                  <HeaderCell className="sticky left-0 z-20" />

                  {columnLabels.map((columnLabel) => (
                    <HeaderCell key={columnLabel} className="z-10 font-ax-bold">
                      {columnLabel}
                    </HeaderCell>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rowIndex) => (
                  <ExcelTableRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id
                    key={rowIndex}
                    row={row}
                    rowIndex={rowIndex}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

ExcelTable.displayName = 'ExcelTable';

const HeaderCell = ({ className, children }: { className: string; children?: React.ReactNode }) => (
  <th
    className={`border border-ax-border-neutral bg-ax-bg-neutral-moderate/70 px-2 py-1 text-center text-ax-text-subtle text-xs ${className}`}
  >
    {children}
  </th>
);

/**
 * Convert a zero-based column index to an Excel-style column label.
 *
 * 0 → "A", 1 → "B", …, 25 → "Z", 26 → "AA", 27 → "AB", …
 */
const columnIndexToLabel = (index: number): string => {
  let label = '';
  let remaining = index;

  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return label;
};
