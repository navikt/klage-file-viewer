import { useCallback, useRef } from 'react';
import { clamp } from '@/lib/clamp';
import { MIN_INLINE_WIDTH } from '@/scale/constants';

interface WidthHandleProps {
  width: number;
  setWidth: (width: number) => void;
}

export const WidthHandle = ({ width, setWidth }: WidthHandleProps) => {
  const widthRef = useRef(width);
  widthRef.current = width;
  const elementRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const element = elementRef.current;
      const container = element?.parentElement;

      if (element === null || container === null || container === undefined) {
        return;
      }

      element.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startWidth = widthRef.current;
      let currentWidth = startWidth;
      let requestAnimationFrameId: number | null = null;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        currentWidth = clamp(startWidth + deltaX, MIN_INLINE_WIDTH, window.innerWidth);

        if (requestAnimationFrameId === null) {
          requestAnimationFrameId = requestAnimationFrame(() => {
            container.style.width = `${currentWidth.toString(10)}px`;
            setWidth(currentWidth);
            requestAnimationFrameId = null;
          });
        }
      };

      const onPointerUp = () => {
        if (requestAnimationFrameId !== null) {
          cancelAnimationFrame(requestAnimationFrameId);
        }

        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        element.removeEventListener('pointermove', onPointerMove);
        element.removeEventListener('pointerup', onPointerUp);

        setWidth(currentWidth);
      };

      element.addEventListener('pointermove', onPointerMove);
      element.addEventListener('pointerup', onPointerUp);
    },
    [setWidth],
  );

  return (
    <div
      ref={elementRef}
      aria-hidden
      className="group absolute top-0 right-0 bottom-0 z-50 flex w-2 cursor-col-resize select-none items-center justify-center"
      onPointerDown={handlePointerDown}
    >
      <div className="h-8 w-1 rounded-full bg-ax-border-neutral opacity-50 transition-opacity group-hover:opacity-100" />
    </div>
  );
};
