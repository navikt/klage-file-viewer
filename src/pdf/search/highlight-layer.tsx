import { useCallback } from 'react';
import type { HighlightRect } from '@/pdf/search/types';

interface HighlightLayerProps {
  highlights: HighlightRect[];
  currentMatchIndex: number;
}

export const HighlightLayer = ({ highlights, currentMatchIndex }: HighlightLayerProps) => {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <div
      className="pdf-highlight-layer pointer-events-none absolute top-0 left-0 h-full w-full select-none"
      style={{ zIndex: 1 }}
    >
      {highlights.map((highlight, index) => (
        <Highlight
          key={`${highlight.top}-${highlight.left}-${index}`}
          highlight={highlight}
          isCurrent={highlight.matchIndex === currentMatchIndex}
        />
      ))}
    </div>
  );
};

interface HighlightProps {
  highlight: HighlightRect;
  isCurrent: boolean;
}

export const Highlight = ({ highlight, isCurrent }: HighlightProps) => {
  const scrollRef = useCallback(
    (element: HTMLSpanElement | null) => {
      if (element !== null && isCurrent) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [isCurrent],
  );

  return (
    <span
      ref={scrollRef}
      data-match-index={highlight.matchIndex}
      className="absolute rounded-sm"
      style={{
        top: highlight.top,
        left: highlight.left,
        width: highlight.width,
        height: highlight.height,
        backgroundColor: isCurrent ? 'rgba(255, 165, 0, 0.6)' : 'rgba(255, 255, 0, 0.4)',
        transition: 'background-color 150ms ease',
      }}
    />
  );
};
