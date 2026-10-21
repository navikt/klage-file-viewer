import { getMarkerPalette } from '@/files/pdf/highlights/marker-style';
import type { StoredHighlight } from '@/files/pdf/highlights/types';

interface MarkerHighlightLayerProps {
  highlights: StoredHighlight[];
  hoveredHighlightId: string | null;
  /** `true` when the content under the layer is shown colour-inverted. */
  inverted: boolean;
}

/**
 * Draws persisted marker highlights over the page image.
 *
 * Rects are opaque and the whole layer is blended onto the page, so text stays
 * readable (like a real highlighter) and overlapping highlights never stack
 * into a darker shade. A light page uses `multiply` (dark text stays dark); a
 * colour-inverted page in dark mode uses `screen` with a darker palette (light
 * text stays light).
 */
export const MarkerHighlightLayer = ({ highlights, hoveredHighlightId, inverted }: MarkerHighlightLayerProps) => {
  const palette = getMarkerPalette(inverted);

  if (highlights.length === 0) {
    return null;
  }

  return (
    <div
      data-klage-file-viewer-marker-layer={inverted ? 'inverted' : 'normal'}
      className="pointer-events-none absolute inset-0 select-none"
      style={{
        zIndex: 1,
        mixBlendMode: inverted ? 'screen' : 'multiply',
      }}
    >
      {highlights.flatMap((highlight) =>
        highlight.rects.map((rect, index) => (
          <div
            key={`${highlight.id}-${index.toString(10)}`}
            data-klage-file-viewer-marker-highlight={highlight.id}
            className="absolute rounded-xs"
            style={{
              left: toPercent(rect.x),
              top: toPercent(rect.y),
              width: toPercent(rect.width),
              height: toPercent(rect.height),
              backgroundColor: highlight.id === hoveredHighlightId ? palette.hover : palette.color,
            }}
          />
        )),
      )}
    </div>
  );
};

const toPercent = (fraction: number): string => `${(fraction * 100).toString(10)}%`;
