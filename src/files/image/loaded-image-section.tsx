import { BodyShort, Loader } from '@navikt/ds-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFileViewerConfig } from '@/context';
import { type DocumentNavigation, FileHeader } from '@/file-header/file-header';
import type { ResolvedVariant } from '@/file-header/variant-types';
import { FileErrorLayout } from '@/files/file-error-layout';
import { useRotation } from '@/files/image/use-rotation';
import { PageElement } from '@/files/page-element';
import { PlaceholderWrapper } from '@/files/pdf/pdf-section-placeholder';
import { useRegisterRefresh } from '@/hooks/use-refresh-registry';
import { usePrint } from '@/lib/print-frame';
import { A4_WIDTH_PX } from '@/scale/constants';
import type { FileEntry } from '@/types';
import { useFileData } from '@/use-file-data';

interface LoadedImageSectionProps {
  file: FileEntry;
  headerVariant?: ResolvedVariant;
  scale: number;
  onPageCountReady: (pageCount: number) => void;
  documentNavigation?: DocumentNavigation;
}

/** CSS transform matrix for counter-clockwise quarter turns. */
const getRotationTransform = (rotation: 0 | 1 | 2 | 3, width: number, height: number): string => {
  switch (rotation) {
    case 0:
      return 'none';
    case 1:
      // 90° CCW: rotate then translate left by height
      return `rotate(-90deg) translateX(-${height.toString()}px)`;
    case 2:
      // 180°: rotate then translate by both dimensions
      return `rotate(-180deg) translate(-${width.toString()}px, -${height.toString()}px)`;
    case 3:
      // 270° CCW: rotate then translate up by width
      return `rotate(-270deg) translateY(-${width.toString()}px)`;
  }
};

export const LoadedImageSection = ({
  file,
  headerVariant,
  scale,
  onPageCountReady,
  documentNavigation,
}: LoadedImageSectionProps) => {
  const { errorComponent: ErrorComponent, antiAliasing } = useFileViewerConfig();
  const imageRendering = antiAliasing ? 'auto' : 'pixelated';
  const { printBlob } = usePrint();
  const { data, fetching, error, refresh } = useFileData(file.url, file.query);
  const { rotation, handleRotate } = useRotation(file.url);

  useRegisterRefresh(file.url, refresh);

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const handlePrint = useCallback(() => {
    if (data !== null) {
      printBlob(data, data.type || 'image/jpeg');
    }
  }, [data, printBlob]);

  const objectUrl = useMemo(() => {
    if (data === null) {
      return undefined;
    }

    return URL.createObjectURL(data);
  }, [data]);

  useEffect(() => {
    const url = objectUrl;

    return () => {
      if (url !== undefined) {
        URL.revokeObjectURL(url);
      }
    };
  }, [objectUrl]);

  useEffect(() => {
    onPageCountReady(1);
  }, [onPageCountReady]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  if (error !== undefined) {
    return (
      <FileErrorLayout
        file={file}
        headerVariant={headerVariant}
        isLoading={fetching}
        refresh={refresh}
        heading="Feil ved lasting av bilde"
        errorMessage={error}
        ErrorComponent={ErrorComponent}
        documentNavigation={documentNavigation}
      />
    );
  }

  if (objectUrl === undefined) {
    return (
      <>
        <FileHeader
          title={file.title}
          currentPage={null}
          numPages={null}
          newTabUrl={file.newTabUrl}
          downloadUrl={file.downloadUrl}
          variant={headerVariant}
          isLoading={fetching}
          refresh={refresh}
          documentNavigation={documentNavigation}
        />

        <PlaceholderWrapper scale={scale}>
          <Loader size="3xlarge" />
          <BodyShort>Laster bilde …</BodyShort>
        </PlaceholderWrapper>
      </>
    );
  }

  const scaleFactor = scale / 100;
  const baseWidth = A4_WIDTH_PX * scaleFactor;
  const baseHeight = naturalSize !== null ? baseWidth * (naturalSize.height / naturalSize.width) : baseWidth;

  const swapped = rotation === 1 || rotation === 3;
  const containerWidth = swapped ? baseHeight : baseWidth;
  const containerHeight = swapped ? baseWidth : baseHeight;

  const transform = getRotationTransform(rotation, baseWidth, baseHeight);

  return (
    <>
      <FileHeader
        title={file.title}
        currentPage={1}
        numPages={1}
        newTabUrl={file.newTabUrl}
        downloadUrl={file.downloadUrl}
        onPrint={handlePrint}
        variant={headerVariant}
        isLoading={fetching}
        refresh={refresh}
        documentNavigation={documentNavigation}
      />

      <PageElement pageNumber={1} onRotate={handleRotate}>
        <div className="relative" style={{ width: containerWidth, height: containerHeight }}>
          <img
            src={objectUrl}
            alt={file.title}
            className="block max-w-none shadow-ax-dialog"
            style={{ width: baseWidth, height: baseHeight, imageRendering, transformOrigin: '0 0', transform }}
            onLoad={handleImageLoad}
            draggable={false}
          />
        </div>
      </PageElement>
    </>
  );
};
