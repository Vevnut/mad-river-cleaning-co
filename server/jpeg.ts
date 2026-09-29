/**
 * Structural JPEG check for uploads (the app re-encodes photos to JPEG in the
 * browser before upload, so real uploads always pass). Walks the marker
 * segments from SOI to SOS and requires a frame header, a scan and an EOI end
 * marker, so arbitrary files with a spoofed prefix are refused.
 */
export function isJpeg(b: Buffer): boolean {
  if (!Buffer.isBuffer(b) || b.length < 64 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  // Must end with EOI (allow a few trailing padding bytes some encoders add).
  const tail = b.subarray(Math.max(2, b.length - 16));
  let eoi = false;
  for (let i = tail.length - 2; i >= 0; i--) if (tail[i] === 0xff && tail[i + 1] === 0xd9) { eoi = true; break; }
  if (!eoi) return false;
  let i = 2, frame = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return false;
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; } // fill bytes
    if (m >= 0xd0 && m <= 0xd7) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return false;
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) frame = true;
    if (m === 0xda) return frame; // start of scan: image data follows
    if (m === 0xd9) return false;
    i += 2 + len;
  }
  return false;
}

/** Headers for serving a stored photo: image only, never sniffed or run as a page. */
export const IMAGE_HEADERS = {
  "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline",
  "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store",
};
