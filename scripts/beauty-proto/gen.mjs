import sharp from "/Users/home/Documents/rimikimi_app/node_modules/sharp/dist/index.cjs";
import { applyLook } from "/Users/home/Documents/rimikimi_app/src/filters.js";
import { BEAUTY } from "./presets.mjs";
const S = "/private/tmp/claude-501/-Users-home-Documents-rimikimi-app/010b4f52-b524-490a-aa2c-5602ff93d5e1/scratchpad";
const W = 360, H = 480;
const bases = ["vintP", "ph16pro"].map((k) => `${S}/fsfinal/${k}.png`);
const tiles = [];
for (const src of bases) {
  const { data } = await sharp(src).resize(W, H, { fit: "cover", position: "top" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  tiles.push({ buf: Buffer.from(data), label: "원본" });
  for (const p of BEAUTY) { const px = Buffer.from(data); applyLook(px, W, H, p, { ...(p.fx || {}), seed: 7 }); tiles.push({ buf: px, label: p.ko }); }
}
const cols = 11, rows = bases.length, LH = 40;
const comp = [];
tiles.forEach((t, i) => {
  const x = (i % cols) * (W + 8), y = Math.floor(i / cols) * (H + LH + 8);
  comp.push({ input: t.buf, raw: { width: W, height: H, channels: 4 }, left: x, top: y + LH });
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${LH}"><text x="8" y="30" font-size="28" font-family="Apple SD Gothic Neo" font-weight="700">${t.label}</text></svg>`), left: x, top: y });
});
await sharp({ create: { width: cols * (W + 8), height: rows * (H + LH + 8), channels: 3, background: "#fff" } }).composite(comp).jpeg({ quality: 82 }).toFile(`${S}/beauty/sheet.jpg`);
console.log("ok");
