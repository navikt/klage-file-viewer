import type { DocumentNavigation } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { ExcelSectionPlaceholder } from '@/files/excel/excel-section-placeholder';
import { LoadedExcelSection } from '@/files/excel/loaded-excel-section';
import type { FileEntry } from '@/types';

interface ExcelSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether this section should load its data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const ExcelSection = ({
  file,
  headerVariant,
  scrollContainerRef,
  shouldLoad,
  onPageCountReady,
  documentNavigation,
}: ExcelSectionProps) => (
  <section className="flex w-full flex-col items-center gap-4">
    {shouldLoad ? (
      <LoadedExcelSection
        file={file}
        headerVariant={headerVariant}
        scrollContainerRef={scrollContainerRef}
        onPageCountReady={onPageCountReady}
        documentNavigation={documentNavigation}
      />
    ) : (
      <ExcelSectionPlaceholder title={file.title} />
    )}
  </section>
);
