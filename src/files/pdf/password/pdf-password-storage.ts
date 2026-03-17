import { getStorageKey } from '@/lib/storage-key';

const getPasswordKey = (fileUrl: string): string => getStorageKey('pdf-password', fileUrl);

export const getStoredPassword = (fileUrl: string): string | null => {
  try {
    return localStorage.getItem(getPasswordKey(fileUrl));
  } catch {
    return null;
  }
};

export const storePassword = (fileUrl: string, password: string): void => {
  try {
    localStorage.setItem(getPasswordKey(fileUrl), password);
  } catch {
    // Silently ignore storage errors (e.g. quota exceeded, private browsing)
  }
};

export const removeStoredPassword = (fileUrl: string): void => {
  try {
    localStorage.removeItem(getPasswordKey(fileUrl));
  } catch {
    // Silently ignore storage errors
  }
};
