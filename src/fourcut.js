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
  // ── 테마 프리셋: 프레임뿐 아니라 "찍히는 사진"(의상·배경)이 달라진다 (서버 FC_STYLE 과 key 1:1) ──
  { key: "school",    label: "교복",       emoji: "🎒", bg: "#e8eefc", cell: "#ffffff", accent: "#3b5fb5", text: "#2b4790", stickers: ["✎", "★", "◦", "✿"] },
  { key: "couple",    label: "커플",       emoji: "💑", bg: "#ffe9ec", cell: "#ffffff", accent: "#ff7a90", text: "#d64b66", stickers: ["♥", "♡", "✧", "❥"] },
  { key: "wedding",   label: "웨딩",       emoji: "💍", bg: "#f7f1e6", cell: "#fffdf8", accent: "#c9a227", text: "#9a7b1f", stickers: ["✦", "❀", "◇", "✧"] },
  { key: "party",     label: "파티",       emoji: "🥂", bg: "#1b1430", cell: "#ffffff", accent: "#c9a7ff", text: "#e6d6ff", stickers: ["✧", "★", "✦", "❉"] },
  { key: "beach",     label: "여름",       emoji: "🏖", bg: "#d9f2ea", cell: "#ffffff", accent: "#2fb39a", text: "#1e8874", stickers: ["🐚", "☀", "🌊", "✺"] },
  { key: "vintage",   label: "빈티지",     emoji: "📻", bg: "#f0e2cc", cell: "#fffaf0", accent: "#b07d3a", text: "#8a5f27", stickers: ["✶", "◍", "❖", "✧"] },
  { key: "christmas", label: "크리스마스", emoji: "🎄", bg: "#f6e2e2", cell: "#ffffff", accent: "#c0392b", text: "#1f6b3a", stickers: ["🎄", "❄", "🎁", "★"] },
  { key: "newtro",    label: "뉴트로",     emoji: "🕹", bg: "#fff0d6", cell: "#ffffff", accent: "#ff5a3c", text: "#1f4fd8", stickers: ["★", "▲", "●", "■"] },
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

// images: dataURL[] (length === count). 반환: 합성된 스트립 dataURL(JPEG)
//
// ⚠️ 인생네컷의 "결과물"은 컷 N장이 아니라 합성된 스트립 1장이다.
//    그래서 해상도를 최대한 확보한다 — 기본 설계(셀 560px)를 전체 픽셀수가
//    약 4.2MP(≈2K급)가 되도록 스케일업하되, 원본 컷(1024px)보다 크게 늘려
//    뿌옇게 만들지 않도록 셀 너비는 1024px 로 캡한다.
const TARGET_PX = 4.2e6;
const MAX_CELL_W = 1024;

export async function composeStrip(images, styleKey, count, dateStr) {
  const st = fourcutStyle(styleKey);
  const [cols, rows] = gridFor(count);

  // 기본(1x) 설계 치수
  const B_CELL = 560, B_GAP = 16, B_PAD = 28, B_FOOT = 96;
  const baseW = B_PAD * 2 + cols * B_CELL + (cols - 1) * B_GAP;
  const baseH = B_PAD + rows * Math.round((B_CELL * 4) / 3) + (rows - 1) * B_GAP + B_FOOT;
  const k = Math.max(1, Math.min(Math.sqrt(TARGET_PX / (baseW * baseH)), MAX_CELL_W / B_CELL));

  const CELL_W = Math.round(B_CELL * k);
  const CELL_H = Math.round((CELL_W * 4) / 3); // 3:4 컷
  const GAP = Math.round(B_GAP * k);
  const PAD = Math.round(B_PAD * k);
  const FOOTER = Math.round(B_FOOT * k);
  const R = Math.round(12 * k); // 컷 모서리 라운드
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
    roundRect(g, x, y, CELL_W, CELL_H, R);
    g.fill();
    const img = imgs[i % imgs.length];
    if (img) drawCover(g, img, x, y, CELL_W, CELL_H, R);
    // 컷 모서리 스티커
    const s = st.stickers[i % st.stickers.length];
    g.font = `${Math.round(44 * k)}px 'Apple Color Emoji','Segoe UI Emoji',sans-serif`;
    g.textBaseline = "top";
    g.textAlign = "left";
    g.fillText(s, x + Math.round(12 * k), y + Math.round(10 * k));
  }

  // 하단 푸터: rimikimi + 날짜
  const fy = H - FOOTER;
  g.textBaseline = "middle";
  g.fillStyle = st.text;
  g.textAlign = "left";
  g.font = `700 ${Math.round(40 * k)}px 'Quicksand','Jua',sans-serif`;
  g.fillText("rimikimi", PAD + Math.round(4 * k), fy + FOOTER / 2);
  g.textAlign = "right";
  g.font = `500 ${Math.round(28 * k)}px 'Quicksand','Jua',sans-serif`;
  g.fillText(dateStr || todayStr(), W - PAD - Math.round(4 * k), fy + FOOTER / 2);

  // PNG 는 4~5MP 사진 합성물에서 20MB를 넘겨 업로드가 막힌다 → JPEG.
  return c.toDataURL("image/jpeg", 0.9);
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
