import { ExcelSectionPlaceholder } from '@/excel/excel-section-placeholder';
import { LoadedExcelSection } from '@/excel/loaded-excel-section';
import type { ExcelFileEntry } from '@/types';

interface ExcelSectionProps {
  file: ExcelFileEntry;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether this section should load its data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** URL to the Excel web worker script. Required for parsing Excel files. */
  excelWorkerSrc?: string;
}

export const ExcelSection = ({
  file,
  scale,
  scrollContainerRef,
  shouldLoad,
  onPageCountReady,
  excelWorkerSrc,
}: ExcelSectionProps) => (
  <section className="flex w-full flex-col items-center gap-4">
    {shouldLoad ? (
      <LoadedExcelSection
        file={file}
        scale={scale}
        scrollContainerRef={scrollContainerRef}
        onPageCountReady={onPageCountReady}
        excelWorkerSrc={excelWorkerSrc}
      />
    ) : (
      <ExcelSectionPlaceholder title={file.title} scale={scale} />
    )}
  </section>
);
