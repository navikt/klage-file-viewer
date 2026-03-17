import { useEffect, useState } from 'react';

const getDpr = (): number => Math.max(window.devicePixelRatio, 1);

/**
 * Reactively tracks `window.devicePixelRatio`.
 *
 * Updates when the user moves the window to a monitor with a different DPR,
 * changes the OS display scaling, or zooms the browser.
 *
 * Uses `matchMedia` with a `resolution` query, which is the recommended
 * approach since `devicePixelRatio` itself is not observable.
 */
export const useDpr = (): number => {
  const [dpr, setDpr] = useState(getDpr);

  useEffect(() => {
    let active = true;
    let mediaQueryList: MediaQueryList | null = null;

    const updateDpr = () => {
      if (!active) {
        return;
      }

      setDpr(getDpr());
      listen();
    };

    const listen = () => {
      // Clean up previous listener, if any.
      mediaQueryList?.removeEventListener('change', updateDpr);

      // Create a new query that matches the *current* DPR.
      // When the DPR changes, this query will no longer match and fire a `change` event.
      // We then create a new query for the new DPR, and so on.
      const query = `(resolution: ${window.devicePixelRatio.toString(10)}dppx)`;
      mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener('change', updateDpr);
    };

    listen();

    return () => {
      active = false;
      mediaQueryList?.removeEventListener('change', updateDpr);
    };
  }, []);

  return dpr;
};
