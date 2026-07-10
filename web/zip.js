/**
 * Minimal ZIP reader/writer (store method only on write; store + deflate on
 * read) so the app can export/import a full backup without a bundler or
 * external library. No compression on write — recordings are already
 * compressed audio, so it wouldn't save much and keeps this file small.
 */
const MiniZip = (() => {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZip(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);
      const size = data.length;

      const localHeader = new DataView(new ArrayBuffer(30));
      localHeader.setUint32(0, 0x04034b50, true);
      localHeader.setUint16(4, 20, true);
      localHeader.setUint16(6, 0, true);
      localHeader.setUint16(8, 0, true); // store
      localHeader.setUint16(10, 0, true);
      localHeader.setUint16(12, 0x0021, true);
      localHeader.setUint32(14, crc, true);
      localHeader.setUint32(18, size, true);
      localHeader.setUint32(22, size, true);
      localHeader.setUint16(26, nameBytes.length, true);
      localHeader.setUint16(28, 0, true);

      localParts.push(new Uint8Array(localHeader.buffer), nameBytes, data);

      const centralHeader = new DataView(new ArrayBuffer(46));
      centralHeader.setUint32(0, 0x02014b50, true);
      centralHeader.setUint16(4, 20, true);
      centralHeader.setUint16(6, 20, true);
      centralHeader.setUint16(8, 0, true);
      centralHeader.setUint16(10, 0, true);
      centralHeader.setUint16(12, 0, true);
      centralHeader.setUint16(14, 0x0021, true);
      centralHeader.setUint32(16, crc, true);
      centralHeader.setUint32(20, size, true);
      centralHeader.setUint32(24, size, true);
      centralHeader.setUint16(28, nameBytes.length, true);
      centralHeader.setUint16(30, 0, true);
      centralHeader.setUint16(32, 0, true);
      centralHeader.setUint16(34, 0, true);
      centralHeader.setUint16(36, 0, true);
      centralHeader.setUint32(38, 0, true);
      centralHeader.setUint32(42, offset, true);

      centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    }

    const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);
    const centralDirOffset = offset;

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, centralDirSize, true);
    eocd.setUint32(16, centralDirOffset, true);
    eocd.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(eocd.buffer)], { type: "application/zip" });
  }

  async function readZip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let eocdOffset = -1;
    const searchFloor = Math.max(0, bytes.length - 22 - 65536);
    for (let i = bytes.length - 22; i >= searchFloor; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) throw new Error("Not a valid zip file.");

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);

    const result = new Map();
    const decoder = new TextDecoder();
    let ptr = centralDirOffset;

    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compData = bytes.subarray(dataStart, dataStart + compSize);

      let fileData;
      if (method === 0) {
        fileData = compData.slice();
      } else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        fileData = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error(`Unsupported zip compression method (${method}) for "${name}".`);
      }

      result.set(name, fileData);
      ptr += 46 + nameLen + extraLen + commentLen;
    }

    return result;
  }

  return { createZip, readZip };
})();
