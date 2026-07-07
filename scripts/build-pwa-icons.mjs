// Generates public/icon-192.png and public/icon-512.png for the PWA manifest.
// Pure Node + fflate (already a dependency) — no image libraries needed.
// Design: slate-900 tile, amber storage-unit door with slate stripes, matching
// the app's dark theme. Glyph stays inside the center ~80% so maskable icons
// crop safely.
import { zlibSync } from 'fflate';
import { writeFileSync } from 'node:fs';

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
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', Buffer.from(zlibSync(raw, { level: 9 }))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [0x0f, 0x17, 0x2a];      // slate-900
const AMBER = [0xf5, 0x9e, 0x0b];   // amber-500
const DARK = [0x02, 0x06, 0x17];    // slate-950

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function drawIcon(size) {
  const s = size / 512; // design in 512 space, scale down
  const rgba = Buffer.alloc(size * size * 4);
  // Storage unit: amber rounded body, dark roll-up door with amber slats
  const body = { x0: 104 , y0: 120, x1: 408, y1: 400, r: 36 };
  const door = { x0: 152, y0: 192, x1: 360, y1: 400 };
  const slats = [232, 288, 344]; // dark gaps between door slats (y, 20px tall)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / s, dy = y / s;
      let c = BG;
      if (inRoundedRect(dx, dy, body.x0, body.y0, body.x1, body.y1, body.r)) {
        c = AMBER;
        if (dx >= door.x0 && dx <= door.x1 && dy >= door.y0 && dy <= door.y1) {
          c = DARK;
          for (const sy of slats) if (dy >= sy && dy < sy + 26) c = AMBER;
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

writeFileSync(new URL('../public/icon-192.png', import.meta.url), drawIcon(192));
writeFileSync(new URL('../public/icon-512.png', import.meta.url), drawIcon(512));
console.log('Wrote public/icon-192.png and public/icon-512.png');
