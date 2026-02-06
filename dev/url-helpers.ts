const FILES_QUERY_PARAM = 'files';

const getSelectedKeysFromUrl = (): string[] | null => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(FILES_QUERY_PARAM);

  if (raw === null) {
    return null;
  }

  return raw
    .split(',')
    .map((s) => decodeURIComponent(s.trim()))
    .filter((s) => s.length > 0);
};

const buildQueryString = (keys: Iterable<string>): string => {
  const encoded = Array.from(keys)
    .map((k) => encodeURIComponent(k))
    .join(',');

  return `${FILES_QUERY_PARAM}=${encoded}`;
};

const buildNewTabUrl = (keys: Iterable<string>): string => {
  const query = buildQueryString(keys);

  return `${window.location.origin}${window.location.pathname}?${query}`;
};

const syncUrlToState = (selectedKeys: Set<string>): void => {
  const query = buildQueryString(selectedKeys);
  const newUrl = `${window.location.pathname}?${query}`;

  window.history.replaceState(null, '', newUrl);
};

export { buildNewTabUrl, getSelectedKeysFromUrl, syncUrlToState };
