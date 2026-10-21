/** HTTP adapter for highlight storage servers. See {@link createHttpHighlightStorage}. */
import {
  isRecord,
  validateHighlightChanges,
  validateHighlights,
  validateIds,
} from '@/files/pdf/highlights/highlight-storage';
import {
  type HighlightStorage,
  type HighlightStorageDocument,
  type HighlightStorageDocumentHighlights,
  HighlightStorageError,
} from '@/files/pdf/highlights/storage-contract';
import type { StoredHighlight as MarkerHighlight } from '@/files/pdf/highlights/types';

/** The events the server sends. See {@link HighlightServerEventData} and `HighlightStorageListeners`. */
export const HIGHLIGHT_SERVER_EVENT_NAMES = ['snapshot', 'added', 'removed', 'closed'] as const;

export type HighlightServerEventName = (typeof HIGHLIGHT_SERVER_EVENT_NAMES)[number];

/** A document variant in the server's events. `format` is `null` for documents without variants. */
interface HighlightServerDocument {
  id: string;
  format: string | null;
}

/**
 * The JSON data of each server event. On every (re)connect, subscribe to changes first, then send `snapshot`
 * followed by the changes since, or only `closed`. Send nothing after `closed`.
 */
export interface HighlightServerEventData {
  snapshot: { documents: (HighlightServerDocument & { highlights: MarkerHighlight[] })[] };
  added: HighlightServerDocument & { highlights: MarkerHighlight[] };
  removed: HighlightServerDocument & { highlightIds: string[] };
  closed: Record<string, never>;
}

/** One listener per server event, called with the event's parsed JSON data. See {@link HighlightServerEventData}. */
export interface HighlightServerEventListeners {
  snapshot: (data: unknown) => void;
  added: (data: unknown) => void;
  removed: (data: unknown) => void;
  closed: () => void;
}

/**
 * Connect to the server's events. Stop after `closed`, so the connection is not opened again.
 * Returns a disconnect function.
 */
export type HighlightServerEventSource = (listeners: HighlightServerEventListeners) => () => void;

export interface HttpHighlightStorageOptions {
  /**
   * URL to `POST` a document variant's changes to, as JSON. Responds with the applied changes.
   * See `applyHighlightChanges`. Responds with `409` when the highlights can no longer change,
   * and `413` when the changes are too large.
   */
  getUrl: (document: HighlightStorageDocument) => string;
  /** Extra headers for every request, e.g. for tracing. */
  getHeaders?: () => Record<string, string>;
  /** The server's events. See {@link HighlightServerEventData} and {@link createEventSourceConnection}. */
  connect: HighlightServerEventSource;
  /** Delays between attempts when the network or server fails. */
  retryDelaysMs?: number[];
}

/** Highlight storage on an HTTP server. Retries network and server errors before giving up. */
export const createHttpHighlightStorage = ({
  getUrl,
  getHeaders,
  connect,
  retryDelaysMs = RETRY_DELAYS_MS,
}: HttpHighlightStorageOptions): HighlightStorage => ({
  save: async (document, changes) => {
    const response = await fetchWithRetry(
      getUrl(document),
      {
        method: 'POST',
        headers: { ...getHeaders?.(), 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      },
      retryDelaysMs,
    );

    if (response.status === 409) {
      throw new HighlightStorageError('closed', 'The highlights can no longer change');
    }

    if (response.status === 413) {
      throw new HighlightStorageError('too-large', 'The highlight changes are too large to save');
    }

    if (!response.ok) {
      throw new Error(`Highlights request failed with status ${response.status.toString(10)}`);
    }

    const applied: unknown = await response.json();

    return validateHighlightChanges(applied);
  },
  subscribe: (listeners) =>
    connect({
      snapshot: (data) => {
        const documents = parseSnapshot(data);

        if (documents !== null) {
          listeners.snapshot(documents);
        }
      },
      added: (data) => {
        const document = parseDocument(data);

        if (document !== null && isRecord(data)) {
          listeners.added(document, validateHighlights(data.highlights));
        }
      },
      removed: (data) => {
        const document = parseDocument(data);

        if (document !== null && isRecord(data)) {
          listeners.removed(document, validateIds(data.highlightIds));
        }
      },
      closed: listeners.closed,
    }),
});

/** Connect to the server's events with an `EventSource`. Reconnects automatically until `closed`. */
export const createEventSourceConnection =
  (url: string): HighlightServerEventSource =>
  ({ snapshot, added, removed, closed }) => {
    const events = new EventSource(url);

    const listen = (name: Exclude<HighlightServerEventName, 'closed'>, listener: (data: unknown) => void) => {
      events.addEventListener(name, (event) => {
        if (event instanceof MessageEvent && typeof event.data === 'string') {
          listener(parseJson(event.data));
        }
      });
    };

    listen('snapshot', snapshot);
    listen('added', added);
    listen('removed', removed);
    events.addEventListener('closed', () => {
      events.close();
      closed();
    });

    return () => events.close();
  };

const RETRY_DELAYS_MS = [500, 2_000, 5_000];

const fetchWithRetry = async (url: string, init: RequestInit, retryDelaysMs: number[]): Promise<Response> => {
  const [delay, ...remainingDelays] = retryDelaysMs;

  try {
    const response = await fetch(url, init);

    if (response.status < 500 || delay === undefined) {
      return response;
    }
  } catch (error) {
    if (delay === undefined) {
      throw error;
    }
  }

  await new Promise((resolve) => setTimeout(resolve, delay));

  return fetchWithRetry(url, init, remainingDelays);
};

/** Invalid documents and highlights are left out. Returns `null` for an invalid snapshot. */
const parseSnapshot = (data: unknown): HighlightStorageDocumentHighlights[] | null =>
  isRecord(data) && Array.isArray(data.documents)
    ? data.documents.map(parseDocumentHighlights).filter(isNotNull)
    : null;

const parseDocumentHighlights = (value: unknown): HighlightStorageDocumentHighlights | null => {
  const document = parseDocument(value);

  return document === null || !isRecord(value)
    ? null
    : { ...document, highlights: validateHighlights(value.highlights) };
};

const parseDocument = (value: unknown): HighlightStorageDocument | null => {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }

  return { id: value.id, format: typeof value.format === 'string' ? value.format : undefined };
};

const isNotNull = <T>(value: T | null): value is T => value !== null;

const parseJson = (data: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(data);

    return parsed;
  } catch {
    return null;
  }
};
