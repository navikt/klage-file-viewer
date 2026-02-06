/**
 * Minimal ZIP archive extractor using the Compression Streams API.
 *
 * Only the subset of ZIP needed for xlsx files is supported:
 * - Compression method 0 (stored) and 8 (deflate)
 * - Standard ZIP (not ZIP64)
 *
 * Decompression is performed with `DecompressionStream('deflate-raw')`,
 * which is available in all modern browsers and eliminates the need for a
 * third-party library like `fflate`.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all files from a ZIP archive.
 *
 * @returns A record mapping file paths to their uncompressed contents.
 */
export const unzip = async (data: ArrayBuffer): Promise<Record<string, Uint8Array>> => {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);

  const eocdOffset = findEOCD(view, bytes.length);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const entries = parseCentralDirectory(view, bytes, cdOffset, entryCount);

  const results = await Promise.all(
    entries.map(async (entry) => {
      const content = await extractEntry(view, bytes, entry);

      return [entry.name, content] as const;
    }),
  );

  return Object.fromEntries(results);
};

// ---------------------------------------------------------------------------
// ZIP structures
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

// ---------------------------------------------------------------------------
// Central directory parsing
// ---------------------------------------------------------------------------

/** Signature: `PK\x05\x06` */
const EOCD_SIGNATURE = 0x06054b50;
/** Signature: `PK\x01\x02` */
const CD_SIGNATURE = 0x02014b50;

/** Minimum size of the End of Central Directory record (no comment). */
const EOCD_MIN_SIZE = 22;
/** Maximum possible comment length in a ZIP file. */
const MAX_COMMENT_LENGTH = 0xffff;

/**
 * Locate the End of Central Directory record by scanning backward from the
 * end of the file.
 */
const findEOCD = (view: DataView, length: number): number => {
  const searchStart = Math.max(0, length - EOCD_MIN_SIZE - MAX_COMMENT_LENGTH);

  for (let offset = length - EOCD_MIN_SIZE; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error('Invalid ZIP: End of Central Directory record not found');
};

const decoder = new TextDecoder();

/** Read all central directory entries into a flat list. */
const parseCentralDirectory = (view: DataView, bytes: Uint8Array, cdOffset: number, count: number): ZipEntry[] => {
  const entries: ZipEntry[] = [];
  let pos = cdOffset;

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== CD_SIGNATURE) {
      break;
    }

    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    // Skip directory entries (trailing slash).
    if (!name.endsWith('/')) {
      entries.push({ name, method, compressedSize, localHeaderOffset });
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
};

// ---------------------------------------------------------------------------
// Entry extraction
// ---------------------------------------------------------------------------

const STORED = 0;
const DEFLATED = 8;

/** Extract and decompress a single ZIP entry. */
const extractEntry = async (view: DataView, bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> => {
  // The local file header has its own name/extra field lengths which may
  // differ from the central directory record.
  const localNameLen = view.getUint16(entry.localHeaderOffset + 26, true);
  const localExtraLen = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataOffset = entry.localHeaderOffset + 30 + localNameLen + localExtraLen;
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.method === STORED) {
    return compressed;
  }

  if (entry.method === DEFLATED) {
    return inflate(compressed);
  }

  throw new Error(`Unsupported ZIP compression method ${String(entry.method)} for "${entry.name}"`);
};

/** Decompress a raw deflate buffer using the Compression Streams API. */
const inflate = async (compressed: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
};
