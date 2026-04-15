/**
 * Extracts the font family name from a font file (TTF, OTF, WOFF).
 * WOFF2 is not parsed (requires Brotli) and falls back to the filename,
 * as do any other cases where parsing fails.
 */
export async function parseFontName(file: File): Promise<string> {
  const fallback = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'woff2') {
    return fallback;
  }

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    let nameTableData: ArrayBuffer;
    if (ext === 'woff') {
      nameTableData = await extractWoffNameTable(view, buffer);
    } else {
      nameTableData = extractNameTable(view, buffer);
    }

    return readFamilyName(new DataView(nameTableData)) || fallback;
  } catch {
    return fallback;
  }
}

/** Locate the `name` table in a raw OpenType (TTF/OTF) font. */
function extractNameTable(view: DataView, buffer: ArrayBuffer): ArrayBuffer {
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    const tag =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    if (tag === 'name') {
      const tableOffset = view.getUint32(offset + 8);
      const tableLength = view.getUint32(offset + 12);
      return buffer.slice(tableOffset, tableOffset + tableLength);
    }
  }
  throw new Error('name table not found');
}

/** Locate and decompress the `name` table from a WOFF file. */
async function extractWoffNameTable(view: DataView, buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const numTables = view.getUint16(12);
  for (let i = 0; i < numTables; i++) {
    const offset = 44 + i * 20;
    const tag =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    if (tag === 'name') {
      const tableOffset = view.getUint32(offset + 4);
      const compLength = view.getUint32(offset + 8);
      const origLength = view.getUint32(offset + 12);
      const raw = buffer.slice(tableOffset, tableOffset + compLength);

      if (compLength === origLength) return raw;

      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(raw));
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      const result = new Uint8Array(total);
      let pos = 0;
      for (const chunk of chunks) {
        result.set(chunk, pos);
        pos += chunk.length;
      }
      return result.buffer;
    }
  }
  throw new Error('name table not found');
}

/** Read the font family name (nameID 1) from a parsed `name` table. */
function readFamilyName(view: DataView): string | undefined {
  const count = view.getUint16(2);
  const stringOffset = view.getUint16(4);

  for (let i = 0; i < count; i++) {
    const recordOffset = 6 + i * 12;
    const platformID = view.getUint16(recordOffset);
    const encodingID = view.getUint16(recordOffset + 2);
    const nameID = view.getUint16(recordOffset + 6);
    const length = view.getUint16(recordOffset + 8);
    const offset = view.getUint16(recordOffset + 10);

    if (nameID !== 1) continue;

    const strBytes = new Uint8Array(view.buffer, view.byteOffset + stringOffset + offset, length);

    // Platform 3 (Windows), encoding 1 (Unicode BMP) — UTF-16BE
    if (platformID === 3 && encodingID === 1) {
      const chars: string[] = [];
      for (let j = 0; j < length; j += 2) {
        chars.push(String.fromCharCode((strBytes[j] << 8) | strBytes[j + 1]));
      }
      return chars.join('');
    }

    // Platform 1 (Macintosh), encoding 0 (Roman) — ASCII-like
    if (platformID === 1 && encodingID === 0) {
      return new TextDecoder('macintosh').decode(strBytes);
    }
  }
  return undefined;
}
