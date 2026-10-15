import { useEffect, useMemo, useState } from 'react';

export const useScreenSize = () => {
  const [width, setWidth] = useState(window.outerWidth);
  const [height, setHeight] = useState(window.outerHeight);

  useEffect(() => {
    const handleResize = () => {
      setWidth(window.outerWidth);
      setHeight(window.outerHeight);
    };

    window.addEventListener('resize', handleResize);
    // Background tabs report a size of 0 until they are shown.
    document.addEventListener('visibilitychange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleResize);
    };
  }, []);

  return useMemo(() => ({ width, height }), [width, height]);
};
