export interface RGBColor {
  red: number;
  green: number;
  blue: number;
}

// Keep the generated EPUB cover and OPFS replacement byte-identical.
export function coverBitmapBytes({ red, green, blue }: RGBColor) {
  const width = 4;
  const height = 4;
  const bytesPerPixel = 3;
  const rowSize = width * bytesPerPixel;
  const pixelBytes = rowSize * height;
  const fileBytes = 54 + pixelBytes;
  const bytes = new Uint8Array(fileBytes);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, fileBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);

  for (let offset = 54; offset < fileBytes; offset += bytesPerPixel) {
    bytes[offset] = blue;
    bytes[offset + 1] = green;
    bytes[offset + 2] = red;
  }

  return bytes;
}
