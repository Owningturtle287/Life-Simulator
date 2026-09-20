import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Rasterize the simple geometric app mark without dependencies or external assets.
const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const n of buf) c = table[(c ^ n) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([length, t, data, checksum]); }
function icon(size) {
  const bytes = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xx = x / size * 512, yy = y / size * 512, dx = xx - 256, dy = yy - 256;
    const ax = dx * .94 - dy * .342, ay = dx * .342 + dy * .94;
    const d = Math.hypot(ax / 142, ay / 150), inner = Math.hypot(dx / 127, dy / 137);
    let c = [16, 37, 45];
    if (Math.abs(d - 1) < .02) c = [180, 237, 210];
    else if (Math.abs(inner - 1) < .012) c = [84, 123, 116];
    if (Math.abs(Math.hypot(xx - 224, yy - 265) - 37) < 2.6) c = [180, 237, 210];
    if (Math.hypot(xx - 317, yy - 206) < 17) c = [237, 179, 142];
    if (Math.hypot(xx - 302, yy - 307) < 10) c = [188, 165, 251];
    const offset = y * (size * 4 + 1) + x * 4 + 1; bytes.set([...c, 255], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0))]);
}
export async function writeIcons(directory) { await mkdir(directory, { recursive: true }); for (const size of [192, 512]) await writeFile(path.join(directory, `icon-${size}.png`), icon(size)); }
