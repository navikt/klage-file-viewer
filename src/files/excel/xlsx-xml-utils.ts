/** Query elements by local name, ignoring XML namespaces. */
export const byTag = (parent: Document | Element, localName: string): Element[] =>
  Array.from(parent.getElementsByTagNameNS('*', localName));

/** Return the first element matching a local name, without allocating an array. */
export const firstByTag = (parent: Document | Element, localName: string): Element | undefined =>
  parent.getElementsByTagNameNS('*', localName)[0] ?? undefined;
