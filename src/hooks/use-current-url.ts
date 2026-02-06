import { useSyncExternalStore } from 'react';

const getCurrentUrl = (): string => `${window.location.origin}${window.location.pathname}${window.location.search}`;

const subscribeToUrl = (callback: () => void): (() => void) => {
  window.addEventListener('popstate', callback);
  window.addEventListener('hashchange', callback);

  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('hashchange', callback);
  };
};

const isCurrentUrl = (url: string, currentUrl: string): boolean => {
  try {
    const resolved = new URL(url, currentUrl);

    return `${resolved.origin}${resolved.pathname}${resolved.search}` === currentUrl;
  } catch {
    return false;
  }
};

const useCurrentUrl = (): string => useSyncExternalStore(subscribeToUrl, getCurrentUrl);

export const useIsCurrentUrl = (url: string): boolean => {
  const currentUrl = useCurrentUrl();

  return isCurrentUrl(url, currentUrl);
};
