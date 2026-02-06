import { apiInfoToItem } from '@dev/file-items';
import type { ApiFileInfo, AvailableItem } from '@dev/types';
import { getSelectedKeysFromUrl, syncUrlToState } from '@dev/url-helpers';
import { useCallback, useEffect, useState } from 'react';

interface UseFileSelectionResult {
  availableItems: AvailableItem[];
  selectedKeys: Set<string>;
  error: string | null;
  toggleItem: (key: string) => void;
}

const useFileSelection = (): UseFileSelectionResult => {
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/files')
      .then((res) => res.json() as Promise<ApiFileInfo[]>)
      .then((apiFiles) => {
        const items: AvailableItem[] = [];

        for (const info of apiFiles) {
          const item = apiInfoToItem(info);

          if (item !== null) {
            items.push(item);
          }
        }

        setAvailableItems(items);

        const urlKeys = getSelectedKeysFromUrl();

        if (urlKeys !== null) {
          const availableKeySet = new Set(items.map((i) => i.key));
          const filtered = urlKeys.filter((k) => availableKeySet.has(k));
          setSelectedKeys(new Set(filtered));
        } else {
          // Select all items by default.
          setSelectedKeys(new Set(items.map((i) => i.key)));
        }
      })
      .catch(() => {
        setError('Kunne ikke hente fillisten.');
      });
  }, []);

  useEffect(() => {
    if (availableItems.length === 0) {
      return;
    }

    syncUrlToState(selectedKeys);
  }, [selectedKeys, availableItems]);

  const toggleItem = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }, []);

  return { availableItems, selectedKeys, error, toggleItem };
};

export { useFileSelection };
