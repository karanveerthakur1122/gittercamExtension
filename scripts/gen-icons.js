// Generates GitterCam PNG icons (16/48/128) into public/icons.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/icons');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Raw scanlines with filter byte 0.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const lensR = size * 0.34;
  const innerR = size * 0.17;
  const radius = size * 0.22; // rounded-corner radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Rounded-rect alpha mask.
      const inset = 0.5;
      let inside = true;
      const minX = inset + radius;
      const maxX = size - 1 - inset - radius;
      const minY = inset + radius;
      const maxY = size - 1 - inset - radius;
      let dxr = 0;
      let dyr = 0;
      if (x < minX) dxr = minX - x;
      else if (x > maxX) dxr = x - maxX;
      if (y < minY) dyr = minY - y;
      else if (y > maxY) dyr = y - maxY;
      if (dxr * dxr + dyr * dyr > radius * radius) inside = false;

      if (!inside) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
        continue;
      }

      // Diagonal brand gradient (blue -> purple).
      const t = (x + y) / (2 * (size - 1));
      let r = lerp(0x5b, 0x8a, t);
      let g = lerp(0x8c, 0x6b, t);
      let b = lerp(0xff, 0xff, t);

      // Camera lens: white ring + dark center + highlight.
      const d = Math.hypot(x - cx, y - cy);
      if (d <= lensR) {
        if (d <= innerR) {
          r = 0x14;
          g = 0x15;
          b = 0x1a;
        } else {
          r = 0xf2;
          g = 0xf4;
          b = 0xff;
        }
        // small highlight dot
        const hd = Math.hypot(x - (cx - lensR * 0.35), y - (cy - lensR * 0.35));
        if (hd <= size * 0.05) {
          r = 0xff;
          g = 0xff;
          b = 0xff;
        }
      }

      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const png = encodePng(size, drawIcon(size));
  writeFileSync(resolve(outDir, `icon${size}.png`), png);
  console.log(`[gittercam] wrote icon${size}.png (${png.length} bytes)`);
}
