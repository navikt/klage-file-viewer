import { ExcelSection } from '@/excel/excel-section';
import { PdfSection } from '@/pdf/pdf-section';
import type { HighlightRect } from '@/pdf/search/types';
import type { FileEntry } from '@/types';

interface FileSectionProps {
  file: FileEntry;
  scale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether this section should load its data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading its pages so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** Shared map so the parent (and search) can reference page elements */
  setPageRef?: (pageNumber: number, element: HTMLDivElement | null) => void;
  /** Search highlights keyed by page number */
  highlightsByPage?: Map<number, HighlightRect[]>;
  currentMatchIndex?: number;
  /** URL to the Excel web worker script. Required when any file has `type: 'excel'`. */
  excelWorkerSrc?: string;
}

export const FileSection = ({
  file,
  scale,
  scrollContainerRef,
  shouldLoad,
  onPageCountReady,
  setPageRef,
  highlightsByPage,
  currentMatchIndex,
  excelWorkerSrc,
}: FileSectionProps) => {
  switch (file.type) {
    case 'pdf':
      return (
        <PdfSection
          pdf={file}
          scale={scale}
          scrollContainerRef={scrollContainerRef}
          shouldLoad={shouldLoad}
          onPageCountReady={onPageCountReady}
          setPageRef={setPageRef}
          highlightsByPage={highlightsByPage}
          currentMatchIndex={currentMatchIndex}
        />
      );
    case 'excel':
      return (
        <ExcelSection
          file={file}
          scale={scale}
          scrollContainerRef={scrollContainerRef}
          shouldLoad={shouldLoad}
          onPageCountReady={onPageCountReady}
          excelWorkerSrc={excelWorkerSrc}
        />
      );
  }
};
