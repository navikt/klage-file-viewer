import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { HighlightStorageError } from '@/files/pdf/highlights/storage-contract';
import type { StoredHighlight } from '@/files/pdf/highlights/types';
import { createEventSourceConnection, createHttpHighlightStorage } from '@/highlight-storage';

const DOCUMENT = { id: 'behandling/document', format: 'ARKIV' };
const HIGHLIGHT: StoredHighlight = {
  id: 'a',
  pageIndex: 0,
  source: 'pdf',
  rects: [{ x: 0.1, y: 0.2, width: 0.1, height: 0.02 }],
  text: 'a',
  createdAt: 0,
};

describe('createHttpHighlightStorage', () => {
  afterEach(() => {
    mock.restore();
  });

  it('rejects with the reason when the highlights are closed or the changes too large', async () => {
    mockFetch([new Response(null, { status: 409 }), new Response(null, { status: 413 })]);
    const storage = createHttpHighlightStorage({ getUrl: () => '/highlights', connect: NO_EVENTS });
    const changes = { added: [HIGHLIGHT], removedIds: [] };

    expect(await getRejection(storage.save(DOCUMENT, changes))).toMatchObject({ reason: 'closed' });
    expect(await getRejection(storage.save(DOCUMENT, changes))).toMatchObject({ reason: 'too-large' });
  });

  it('retries network and server errors, but not client errors', async () => {
    const calls = mockFetch([
      new TypeError('Failed to fetch'),
      new Response(null, { status: 503 }),
      json({ added: [HIGHLIGHT], removedIds: ['b'] }),
      new Response(null, { status: 400 }),
    ]);
    const storage = createHttpHighlightStorage({
      getUrl: () => '/highlights',
      connect: NO_EVENTS,
      retryDelaysMs: [0, 0, 0],
    });

    expect(await storage.save(DOCUMENT, { added: [HIGHLIGHT], removedIds: ['b'] })).toEqual({
      added: [HIGHLIGHT],
      removedIds: ['b'],
    });
    expect(calls()).toBe(3);

    const rejection = await getRejection(storage.save(DOCUMENT, { added: [], removedIds: ['b'] }));
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBeInstanceOf(HighlightStorageError);
    expect(calls()).toBe(4);
  });

  it('maps server events, leaving out invalid highlights and documents', () => {
    const received: unknown[][] = [];
    const storage = createHttpHighlightStorage({
      getUrl: () => '/highlights',
      connect: ({ snapshot, added, removed, closed }) => {
        snapshot({ documents: [{ id: DOCUMENT.id, format: null, highlights: [HIGHLIGHT, { id: 'invalid' }] }, {}] });
        added({ ...DOCUMENT, highlights: [HIGHLIGHT] });
        snapshot({ documents: null });
        added({ format: 'ARKIV', highlights: [HIGHLIGHT] });
        removed({ ...DOCUMENT, highlightIds: ['a', 1] });
        closed();

        return () => undefined;
      },
    });

    storage.subscribe({
      snapshot: (...args) => received.push(['snapshot', ...args]),
      added: (...args) => received.push(['added', ...args]),
      removed: (...args) => received.push(['removed', ...args]),
      closed: () => received.push(['closed']),
    });

    expect(received).toEqual([
      ['snapshot', [{ id: DOCUMENT.id, format: undefined, highlights: [HIGHLIGHT] }]],
      ['added', DOCUMENT, [HIGHLIGHT]],
      ['removed', DOCUMENT, ['a']],
      ['closed'],
    ]);
  });
});

describe('createEventSourceConnection', () => {
  it("calls each event's listener with its parsed data, and stops after closed", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, writable: true, value: FakeEventSource });

    try {
      const received: unknown[][] = [];

      createEventSourceConnection('/highlights/b/events')({
        snapshot: (data) => received.push(['snapshot', data]),
        added: (data) => received.push(['added', data]),
        removed: (data) => received.push(['removed', data]),
        closed: () => received.push(['closed']),
      });

      const source = FakeEventSource.instances.at(-1);
      source?.send('snapshot', '{"documents":[]}');
      source?.send('added', 'not json');
      source?.send('removed', '{"id":"d"}');
      source?.send('closed', '{}');

      expect(source?.url).toBe('/highlights/b/events');
      expect(received).toEqual([
        ['snapshot', { documents: [] }],
        ['added', null],
        ['removed', { id: 'd' }],
        ['closed'],
      ]);
      expect(source?.closed).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'EventSource', previous ?? { configurable: true, value: undefined });
    }
  });
});

class FakeEventSource extends EventTarget {
  static readonly instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  send(name: string, data: string) {
    this.dispatchEvent(new MessageEvent(name, { data }));
  }

  close() {
    this.closed = true;
  }
}

const NO_EVENTS = () => () => undefined;

/** Responds with the given results in order. Returns the number of calls so far. */
const mockFetch = (results: (Response | Error)[]): (() => number) => {
  const queue = [...results];
  const respond = async (): Promise<Response> => {
    const result = queue.shift();

    if (result === undefined) {
      throw new Error('Unexpected request');
    }

    if (result instanceof Error) {
      throw result;
    }

    return result;
  };
  const spy = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(respond, { preconnect: fetch.preconnect }));

  return () => spy.mock.calls.length;
};

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

const getRejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected a rejection');
};
