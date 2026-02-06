import { memo } from 'react';

interface ExcelSheetHeaderProps {
  sheetName: string;
}

export const ExcelSheetHeader = memo(({ sheetName }: ExcelSheetHeaderProps) => (
  <div className="border border-t-ax-bg-neutral-moderate/50 border-r-ax-bg-neutral-moderate/50 border-b-ax-border-neutral border-l-ax-bg-neutral-moderate/50 bg-ax-bg-neutral-moderate/50 px-3 py-1.5">
    <span className="font-ax-bold text-sm">{sheetName}</span>
  </div>
));

ExcelSheetHeader.displayName = 'ExcelSheetHeader';
