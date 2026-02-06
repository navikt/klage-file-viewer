import { memo } from 'react';
import type { CellValue } from 'read-excel-file';

interface ExcelTableCellProps {
  value: CellValue;
}

export const ExcelTableCell = memo(({ value }: ExcelTableCellProps) => (
  <td className="whitespace-nowrap border border-ax-border-neutral px-2 py-1">{formatCellValue(value)}</td>
));

ExcelTableCell.displayName = 'ExcelTableCell';

const formatCellValue = (value: CellValue): string => {
  // The library types date cells as `typeof Date` (the constructor), but
  // actually returns `Date` instances at runtime.
  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'JA' : 'NEI';
  }

  if (typeof value === 'number') {
    return value.toString(10);
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear().toString(10);
  const month = (date.getMonth() + 1).toString(10).padStart(2, '0');
  const day = date.getDate().toString(10).padStart(2, '0');

  return `${day}.${month}.${year}`;
};
