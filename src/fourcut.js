// ============================================================
// 인생네컷 (life-N-cut) — 스타일/레이아웃 정의 + 캔버스 합성
//
//  - 사진(컷)은 AI(api/generate, mode fourcut)로 N장 생성
//  - 프레임/스티커/날짜/rimikimi 로고는 여기서 코드로 합성 (텍스트 깨짐·IP 회피)
//  - 포토부스 공통 포맷(흰 여백 + 하단 브랜드/날짜)의 rimikimi 오리지널 프레임
// ============================================================

export const FOURCUT_COUNTS = [2, 3, 4, 6, 8];

export const FOURCUT_STYLES = [
  { key: "cute",     label: "큐티",     emoji: "🎀", bg: "#ffe6f0", cell: "#ffffff", accent: "#ff8fb1", text: "#d6457a", stickers: ["🎀", "💕", "⭐", "🌸"] },
  { key: "luxury",   label: "럭셔리",   emoji: "🖤", bg: "#161616", cell: "#0f0f0f", accent: "#d4af37", text: "#d4af37", stickers: ["✦", "♦", "✧", "❖"] },
  { key: "funky",    label: "펑키",     emoji: "⚡", bg: "#171327", cell: "#ffffff", accent: "#1fe3c8", text: "#ffe14d", stickers: ["★", "☻", "✺", "✿"] },
  { key: "playful",  label: "플레이풀", emoji: "🎉", bg: "#fff2c2", cell: "#ffffff", accent: "#ff5d5d", text: "#ef4d6b", stickers: ["🎉", "✨", "🌈", "😆"] },
  { key: "birthday", label: "버스데이", emoji: "🎂", bg: "#fde4ee", cell: "#ffffff", accent: "#ff7aa8", text: "#e0578c", stickers: ["🎂", "🎈", "🎉", "🥳"] },
  { key: "film",     label: "필름",     emoji: "🎞", bg: "#efe9dc", cell: "#fffdf7", accent: "#a89272", text: "#7b6a4f", stickers: ["✶", "◦", "❍", "✧"] },
  { key: "summer",   label: "썸머",     emoji: "🌊", bg: "#dff1fb", cell: "#ffffff", accent: "#4bb8e8", text: "#2b86b5", stickers: ["🌊", "🐚", "🌴", "☀"] },
  { key: "mono",     label: "모노",     emoji: "◻️", bg: "#f2f2f2", cell: "#ffffff", accent: "#8a8a8a", text: "#3a3a3a", stickers: ["◦", "◻", "✕", "／"] },
];

export function fourcutStyle(key) {
  return FOURCUT_STYLES.find((s) => s.key === key) || FOURCUT_STYLES[0];
}

function gridFor(n) {
  return ({ 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4] })[n] || [2, 2];
}

export function todayStr() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// images: dataURL[] (length === count). 반환: 합성된 스트립 dataURL(PNG)
export async function composeStrip(images, styleKey, count, dateStr) {
  const st = fourcutStyle(styleKey);
  const [cols, rows] = gridFor(count);
  const CELL_W = 560;
  const CELL_H = Math.round((CELL_W * 4) / 3); // 3:4 컷
  const GAP = 16;
  const PAD = 28;
  const FOOTER = 96;
  const W = PAD * 2 + cols * CELL_W + (cols - 1) * GAP;
  const H = PAD + rows * CELL_H + (rows - 1) * GAP + FOOTER;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");

  // 배경
  g.fillStyle = st.bg;
  g.fillRect(0, 0, W, H);

  const imgs = await Promise.all(images.map(loadImg));
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = PAD + col * (CELL_W + GAP);
    const y = PAD + r * (CELL_H + GAP);
    // 컷 배경 + 사진 (cover crop, 라운드)
    g.fillStyle = st.cell;
    roundRect(g, x, y, CELL_W, CELL_H, 12);
    g.fill();
    const img = imgs[i % imgs.length];
    if (img) drawCover(g, img, x, y, CELL_W, CELL_H, 12);
    // 컷 모서리 스티커
    const s = st.stickers[i % st.stickers.length];
    g.font = "44px 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
    g.textBaseline = "top";
    g.textAlign = "left";
    g.fillText(s, x + 12, y + 10);
  }

  // 하단 푸터: rimikimi + 날짜
  const fy = H - FOOTER;
  g.textBaseline = "middle";
  g.fillStyle = st.text;
  g.textAlign = "left";
  g.font = "700 40px 'Quicksand','Jua',sans-serif";
  g.fillText("rimikimi", PAD + 4, fy + FOOTER / 2);
  g.textAlign = "right";
  g.font = "500 28px 'Quicksand','Jua',sans-serif";
  g.fillText(dateStr || todayStr(), W - PAD - 4, fy + FOOTER / 2);

  return c.toDataURL("image/png");
}

function loadImg(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawCover(g, img, x, y, w, h, r) {
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  const ir = img.width / img.height;
  const cr = w / h;
  let dw, dh, dx, dy;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
    dx = x - (dw - w) / 2;
    dy = y;
  } else {
    dw = w;
    dh = w / ir;
    dx = x;
    dy = y - (dh - h) / 2;
  }
  g.drawImage(img, dx, dy, dw, dh);
  g.restore();
}
