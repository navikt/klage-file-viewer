import type { DocumentNavigation } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { ImageSectionPlaceholder } from '@/files/image/image-section-placeholder';
import { LoadedImageSection } from '@/files/image/loaded-image-section';
import { FileSectionContainer } from '@/files/section-container';
import type { FileEntry } from '@/types';

interface ImageSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  /** Whether this section should load its data (managed by the parent). */
  shouldLoad: boolean;
  /** Called when the section finishes loading so the parent can track cumulative page counts. */
  onPageCountReady: (pageCount: number) => void;
  /** Document-level navigation callbacks for navigating between file sections. */
  documentNavigation?: DocumentNavigation;
}

export const ImageSection = ({
  file,
  headerVariant,
  scale,
  shouldLoad,
  onPageCountReady,
  documentNavigation,
}: ImageSectionProps) => (
  <FileSectionContainer>
    {shouldLoad ? (
      <LoadedImageSection
        file={file}
        headerVariant={headerVariant}
        scale={scale}
        onPageCountReady={onPageCountReady}
        documentNavigation={documentNavigation}
      />
    ) : (
      <ImageSectionPlaceholder title={file.title} scale={scale} />
    )}
  </FileSectionContainer>
);
