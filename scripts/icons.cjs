"use strict";
// Repo-native raven/K mark. SVG master and antialiased PNGs share one geometry.
const fs = require("node:fs");
const zlib = require("node:zlib");
fs.mkdirSync("extension/icons", { recursive: true });
fs.mkdirSync("extension/branding", { recursive: true });
const mark = [[17,13],[25,13],[23,30],[36,15],[45,10],[53,17],[48,20],[57,23],[41,26],[32,34],[46,52],[35,50],[22,36],[20,50],[12,50]];
const eye = [[44,16],[49,17],[43,20]];
const frame = [[13,2],[51,2],[62,13],[62,51],[51,62],[13,62],[2,51],[2,13]];
const inner = [[13.4,3],[50.6,3],[61,13.4],[61,50.6],[50.6,61],[13.4,61],[3,50.6],[3,13.4]];
const points = polygon => polygon.map(point => point.join(",")).join(" ");
fs.writeFileSync("extension/branding/mark.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="${points(frame)}" fill="#34363c"/><polygon points="${points(inner)}" fill="#15161a"/><polygon points="${points(mark)}" fill="#ff3b49"/><polygon points="${points(eye)}" fill="#15161a"/></svg>\n`);
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function inside(x, y, polygon) {
  let result = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [ax, ay] = polygon[a], [bx, by] = polygon[b];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) result = !result;
  }
  return result;
}
for (const size of [16, 32, 48, 128, 512]) {
  const scanlines = Buffer.alloc(size * (1 + size * 4)), samples = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const total = [0, 0, 0, 0];
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const px = (x + (sx + .5) / samples) * 64 / size, py = (y + (sy + .5) / samples) * 64 / size;
      let rgba = [0, 0, 0, 0];
      if (inside(px, py, frame)) {
        rgba = inside(px, py, inner) ? [21, 22, 26, 255] : [52, 54, 60, 255];
        if (inside(px, py, mark)) rgba = [255, 59, 73, 255];
        if (inside(px, py, eye)) rgba = [21, 22, 26, 255];
      }
      for (let c = 0; c < 4; c++) total[c] += rgba[c];
    }
    const offset = y * (1 + size * 4) + 1 + x * 4;
    for (let c = 0; c < 4; c++) scanlines[offset + c] = Math.round(total[c] / samples ** 2);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(size === 512 ? "extension/branding/mark-512.png" : `extension/icons/${size}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0))]));
}
console.log("Generated raven/K SVG and PNG icons: 16 / 32 / 48 / 128 / 512 px.");

