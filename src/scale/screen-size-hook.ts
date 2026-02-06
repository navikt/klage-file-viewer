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

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return useMemo(() => ({ width, height }), [width, height]);
};
