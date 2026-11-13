import { gzipSync } from "fflate";

// The pinned JavaScript compressor avoids native zlib and OS-dependent gzip bytes.
export function compressBuildData(bytes) {
  return Buffer.from(gzipSync(bytes, { level: 9, mtime: 0 }));
}
