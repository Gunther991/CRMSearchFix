const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "icons");
const SIZES = [16, 32, 48, 128];

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function setPixel(data, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;

  const index = (y * size + x) * 4;
  data[index] = color[0];
  data[index + 1] = color[1];
  data[index + 2] = color[2];
  data[index + 3] = color[3];
}

function drawIcon(size) {
  const data = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const outerRadius = size * 0.46;
  const ringRadius = size * 0.265;
  const ringWidth = Math.max(2.25, size * 0.125);
  const gapHalfAngle = 0.64;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > outerRadius) {
        setPixel(data, size, x, y, [0, 0, 0, 0]);
        continue;
      }

      const edge = Math.max(0, Math.min(1, (outerRadius - distance) / 1.5));
      const gradient = y / Math.max(1, size - 1);
      const blue = [22, 96, 220];
      const teal = [18, 184, 166];
      const background = [
        clamp(mix(blue[0], teal[0], gradient)),
        clamp(mix(blue[1], teal[1], gradient)),
        clamp(mix(blue[2], teal[2], gradient)),
        clamp(255 * edge)
      ];

      setPixel(data, size, x, y, background);
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const inRing = Math.abs(distance - ringRadius) <= ringWidth;
      const inGap = Math.abs(angle) < gapHalfAngle;

      if (inRing && !inGap) {
        const softEdge = Math.max(0, Math.min(1, (ringWidth - Math.abs(distance - ringRadius)) / 1.2));
        setPixel(data, size, x, y, [255, 255, 255, clamp(255 * softEdge)]);
      }
    }
  }

  const sparkle = Math.max(2, Math.round(size * 0.08));
  const sparkleX = Math.round(size * 0.72);
  const sparkleY = Math.round(size * 0.26);

  for (let offset = -sparkle; offset <= sparkle; offset += 1) {
    const alpha = clamp(220 * (1 - Math.abs(offset) / (sparkle + 1)));
    setPixel(data, size, sparkleX + offset, sparkleY, [255, 255, 255, alpha]);
    setPixel(data, size, sparkleX, sparkleY + offset, [255, 255, 255, alpha]);
  }

  return data;
}

function png(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width * 4;
    const targetStart = y * (width * 4 + 1);
    scanlines[targetStart] = 0;
    rgba.copy(scanlines, targetStart + 1, sourceStart, sourceStart + width * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const filePath = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(filePath, png(size, size, drawIcon(size)));
}
