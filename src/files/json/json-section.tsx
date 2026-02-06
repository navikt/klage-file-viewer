import type { DocumentNavigation } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { JsonSectionPlaceholder } from '@/files/json/json-section-placeholder';
import { LoadedJsonSection } from '@/files/json/loaded-json-section';
import type { FileEntry } from '@/types';

interface JsonSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  /** Whether this section should load its data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const JsonSection = ({
  file,
  headerVariant,
  shouldLoad,
  onPageCountReady,
  documentNavigation,
}: JsonSectionProps) => (
  <section className="flex w-full flex-col items-center gap-4">
    {shouldLoad ? (
      <LoadedJsonSection
        file={file}
        headerVariant={headerVariant}
        onPageCountReady={onPageCountReady}
        documentNavigation={documentNavigation}
      />
    ) : (
      <JsonSectionPlaceholder title={file.title} />
    )}
  </section>
);
