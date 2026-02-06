import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

const ToolbarHeightContext = createContext(0);

/** Read the measured toolbar height (in pixels). */
export const useToolbarHeight = (): number => useContext(ToolbarHeightContext);

interface ToolbarHeightProviderProps {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

export const ToolbarHeightProvider = ({ toolbarRef, children }: ToolbarHeightProviderProps) => {
  const [height, setHeight] = useState(toolbarRef.current?.offsetHeight ?? 0);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setHeight(toolbarRef.current?.offsetHeight ?? 0);
    });

    if (toolbarRef.current) {
      observer.observe(toolbarRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [toolbarRef]);

  return <ToolbarHeightContext.Provider value={height}>{children}</ToolbarHeightContext.Provider>;
};
