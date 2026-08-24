// ============================================================
// 페이스 프로필 v1.1 — 기기 전용 저장 + 품질 게이트
//
// 정본 스펙: rimikimi studios/_design/face-profile-v1.md
// 법적 요건: 같은 폴더 face-profile-legal.md
//
// ⚠️ 이 파일의 핵심 계약은 "얼굴 사진은 이 기기를 떠나 저장되지 않는다" 이다.
//    (v1.1 오너 개정: "서버에 저장 안 하고 클라이언트에만 저장하면 되는 거 아님?")
//    · 서버 테이블 없음 · 클라우드 동기화 없음 · 특징벡터/임베딩 추출 금지(§5)
//    · 생성할 때만 임시 업로드 → 참조로 사용 → 즉시 폐기 (api/generate.js 가 보장)
//    그래서 기기를 바꾸거나 앱을 지우면 프로필은 사라진다. 이건 버그가 아니라
//    이 설계의 값이며, 온보딩·방침에 그대로 쓴다("얼굴은 내 폰에만 저장돼요").
// ============================================================

import { isNative } from "./nativeBridge";

const KEY = "rimikimi_face_profile";

// 동의 문구가 바뀌면 이 값을 올린다 → 기존 프로필은 재동의를 받는다.
export const CONSENT_VERSION = 1;

// 촬영 슬롯 (v1.1 개정: 2026-08-24 오너 지시 "한 장만 올려도 가능하도록").
// 정면 1장만 필수, 나머지는 선택. 이 사진들은 앵커(기준 정면 사진)를 만드는 데만
// 쓰이고 저장되지 않는다 — 기기에 저장되는 건 사용자가 확인한 앵커 1장뿐.
export const ANGLES = [
  { key: "front",   label: "정면",       hint: "카메라를 똑바로 봐주세요",      required: true },
  { key: "left45",  label: "왼쪽 45°",   hint: "고개를 왼쪽으로 살짝 (선택)",   required: false },
  { key: "right45", label: "오른쪽 45°", hint: "고개를 오른쪽으로 살짝 (선택)", required: false },
];
export const REQUIRED_ANGLES = ANGLES.filter((a) => a.required).map((a) => a.key);

/* ---------- 저장 (기기 전용) ---------- */
//
// 네이티브는 Filesystem, 웹은 localStorage 를 쓴다.
// ⚠️ 네이티브에서 localStorage 를 쓰면 안 된다. 1024px JPEG 한 장이 base64 로
//    ~250KB 라 5장이면 1.5MB 에 육박하는데, WKWebView 의 origin 당 할당량이
//    좁아 기존 키(rimikimi_photo, 갤러리 저장목록 등)와 함께 터진다.
//    파일로 빼고 localStorage 에는 경로만 담은 레코드를 남긴다(§5 "파일 + 로컬 레코드").
const DIR = "face";

async function fs() {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Encoding };
}

function readRecord() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    // v1.1 앵커 구조만 유효. 구버전(shots 배열) 레코드는 출시 전 개발 잔재라
    // 그냥 무시한다 — 실사용자 프로필은 아직 존재하지 않는다.
    if (!p || !p.anchor || !(p.anchor.path || p.anchor.dataUrl)) return null;
    return p;
  } catch {
    return null;
  }
}

function writeRecord(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// 저장된 프로필의 메타(사진 데이터 제외). 화면에서 "있다/없다" 판단용.
export function getProfileMeta() {
  const p = readRecord();
  if (!p) return null;
  return {
    consentVersion: p.consentVersion,
    consentAt: p.consentAt,
    count: 1, // 앵커 1장 구조
    angles: ["anchor"],
    // 동의 문구가 개정되면 재동의가 필요하다
    stale: p.consentVersion !== CONSENT_VERSION,
  };
}

export function hasProfile() {
  const m = getProfileMeta();
  return !!m && !m.stale;
}

// 사용자가 확인한 앵커(기준 정면 사진) 1장을 기기에 저장.
// 앵커를 만들 때 쓴 셀카들은 저장하지 않는다 — 세션이 끝나면 사라진다.
export async function saveProfile(anchorDataUrl) {
  await deleteProfile(); // 교체는 항상 전체 교체

  const rec = { consentVersion: CONSENT_VERSION, consentAt: new Date().toISOString(), anchor: {} };

  if (isNative()) {
    const { Filesystem, Directory } = await fs();
    try { await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true }); }
    catch { /* 이미 있으면 무시 */ }
    const name = `${DIR}/anchor.jpg`;
    await Filesystem.writeFile({
      path: name,
      directory: Directory.Data,
      data: stripDataUrl(anchorDataUrl),
    });
    rec.anchor = { path: name };
  } else {
    // 웹은 파일시스템이 없으니 레코드에 그대로 담는다(localStorage 할당량 안에서).
    rec.anchor = { dataUrl: anchorDataUrl };
  }

  if (!writeRecord(rec)) {
    await deleteProfile();
    throw new Error("기기 저장 공간이 부족해요. 사진을 정리한 뒤 다시 시도해 주세요.");
  }
  return getProfileMeta();
}

// 생성에 보낼 형태로 읽는다 — [{ mimeType, base64, angle }] (앵커 1장).
// 여기서 읽은 값은 요청 1회에만 쓰이고 서버에 저장되지 않는다.
export async function loadProfileRefs() {
  const p = readRecord();
  if (!p || p.consentVersion !== CONSENT_VERSION) return [];
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await fs();
      const r = await Filesystem.readFile({ path: p.anchor.path, directory: Directory.Data });
      return [{ mimeType: "image/jpeg", base64: r.data, angle: "anchor" }];
    } catch {
      return []; // 파일이 사라졌으면(기기 정리 등) 프로필 없이 생성한다
    }
  }
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(p.anchor.dataUrl || "");
  return m ? [{ mimeType: m[1], base64: m[2], angle: "anchor" }] : [];
}

// 미리보기용 data URL (프로필 화면 썸네일)
export async function loadProfilePreviews() {
  const p = readRecord();
  if (!p) return [];
  if (!isNative()) return [{ angle: "anchor", dataUrl: p.anchor.dataUrl }];
  try {
    const { Filesystem, Directory } = await fs();
    const r = await Filesystem.readFile({ path: p.anchor.path, directory: Directory.Data });
    return [{ angle: "anchor", dataUrl: "data:image/jpeg;base64," + r.data }];
  } catch {
    return [];
  }
}

// 삭제 — 파일과 레코드를 함께 지운다(legal §6-4 "원자적 파기"의 기기판).
// 서버에는 애초에 사본이 없으므로 이걸로 완전 삭제다.
export async function deleteProfile() {
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await fs();
      // 앵커 + 구버전 각도 파일까지 싹 지운다 (개발 중 잔재 정리 겸)
      try { await Filesystem.rmdir({ path: DIR, directory: Directory.Data, recursive: true }); }
      catch { /* 폴더가 없으면 무시 */ }
    } catch { /* 플러그인 로드 실패해도 레코드는 지운다 */ }
  }
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

// 앵커 생성 요청 — 셀카 1~5장(dataUrl)을 보내면 기준 정면 사진 dataUrl 을 돌려받는다.
// 서버(api/generate.js faceAnchor 브랜치)는 셀카를 저장하지 않는다.
export async function requestAnchor(accessToken, dataUrls) {
  const shots = [];
  for (const [i, d] of dataUrls.entries()) {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(d || "");
    if (m) shots.push({ mimeType: m[1], base64: m[2], angle: "shot" + (i + 1) });
  }
  if (!shots.length) throw new Error("사진을 읽을 수 없어요.");
  const r = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
    body: JSON.stringify({ faceAnchor: true, shots }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.base64) {
    throw new Error((j && j.error) || "기준 사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }
  return "data:" + (j.mimeType || "image/jpeg") + ";base64," + j.base64;
}

function stripDataUrl(d) {
  const i = String(d).indexOf(",");
  return i >= 0 ? String(d).slice(i + 1) : String(d);
}

/* ---------- 품질 게이트 1차 (클라) ---------- */
//
// §1: 얼굴 크기·블러·저조도. 얼굴 검출은 클라에서 신뢰성 있게 못 하므로
// 서버 2차(precheckHasFace)에 맡기고, 여기서는 카메라 단계에서 바로 걸러낼 수 있는
// 물리적 결함만 본다. ⚠️ 조용한 통과 금지(E1) — 실패하면 사유를 반드시 돌려준다.
const MIN_EDGE = 512;      // 장변 최소 픽셀
const MIN_LUMA = 40;       // 평균 밝기 (0~255)
const MAX_LUMA = 235;

// 선명도 임계값 — 실측으로 잡았다(추측 금지).
//   선명한 인물사진 7장: 3.89 / 4.79 / 4.81 / 4.91 / 5.18 / 5.50 / 6.17
//   같은 사진 가우시안 블러: r=2 → 3.69, r=4 → 2.87, r=8 → 2.26
// 처음에 6.0 으로 뒀다가 선명한 7장 중 6장을 반려했다. 스튜디오 인물사진은
// 배경이 평평하고 피부가 매끈해 프레임 평균 gradient 가 원래 낮다.
// 2.8 은 r=4 이상(육안으로도 못 쓸 정도)만 걸러낸다. r=2 정도의 약한 흐림은
// 통과시키는데, 등록 자체를 막는 쪽이 더 나쁜 실패이고 그건 서버 얼굴검사와
// 사용자 눈이 잡는다.
const MIN_SHARPNESS = 2.8;

export async function inspectShot(dataUrl) {
  const img = await loadImage(dataUrl);
  const long = Math.max(img.width, img.height);
  if (long < MIN_EDGE) {
    return { ok: false, reason: `사진이 너무 작아요 (장변 ${long}px). 더 가까이서 다시 찍어주세요.` };
  }

  // 분석은 축소본에서 — 원본 그대로 훑으면 느리다
  const W = 200;
  const H = Math.max(1, Math.round((img.height / img.width) * W));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const luma = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    luma[p] = y; sum += y;
  }
  const avg = sum / luma.length;
  if (avg < MIN_LUMA) return { ok: false, reason: "너무 어두워요. 밝은 곳에서 다시 찍어주세요." };
  if (avg > MAX_LUMA) return { ok: false, reason: "너무 밝아요. 역광을 피해서 다시 찍어주세요." };

  // 선명도: 가로/세로 인접 픽셀 차이의 평균 (간이 gradient)
  let g = 0, n = 0;
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const p = y * W + x;
      g += Math.abs(luma[p] - luma[p - 1]) + Math.abs(luma[p] - luma[p - W]);
      n += 2;
    }
  }
  const sharp = n ? g / n : 0;
  if (sharp < MIN_SHARPNESS) {
    return { ok: false, reason: "사진이 흐려요. 초점을 맞추고 다시 찍어주세요." };
  }

  return { ok: true, metrics: { long, avg: Math.round(avg), sharp: +sharp.toFixed(1) } };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("사진을 읽을 수 없어요."));
    img.src = dataUrl;
  });
}

// 서버 2차 검사 — 얼굴이 실제로 잡히는지.
// 실패(네트워크 등)하면 통과시킨다: 검사 때문에 등록 자체가 막히면 안 된다.
export async function serverFaceCheck(accessToken, dataUrl) {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return { ok: true };
  try {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({ faceCheck: true, mimeType: m[1], base64: m[2] }),
    });
    const j = await r.json();
    if (j && j.ok === false) {
      return { ok: false, reason: "얼굴이 잘 보이지 않아요. 얼굴이 크게 나오도록 다시 찍어주세요." };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
