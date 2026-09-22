import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import { requestFaceAnchor } from "./api";
import { encodeForUpload, type EncodedPhoto, type PhotoRef } from "./photo";

// ============================================================================
// 페이스 프로필 v1.1(1.x src/faceProfile.js) — 기기 전용 저장.
//   "얼굴 사진은 이 기기를 떠나 저장되지 않는다": 서버 테이블 없음 · 동기화 없음.
//   앵커(기준 정면 사진) 1장만 파일로 보관하고, 생성할 때만 `faceRefs` 로 실어 보낸다.
//   앵커는 서버(api/generate faceAnchor 브랜치)가 셀카 1~5장에서 만들어 준다 — 셀카는 저장 안 함.
// ============================================================================

const KEY = "rimikimi_face_profile";
export const CONSENT_VERSION = 1;
const FILE = "face_anchor.jpg";

// ── 얼굴 스캔(3각도) ───────────────────────────────────────────────────────────
// 아이폰 `FaceProfileStore` 와 같은 모양 — 정면·옆①·옆② 3장을 기기에만 두고, 생성할 때
// `faceRefs` 에 **각도와 함께** 실어 보낸다(서버 로그 `angles=` 에 그대로 찍힌다).
// 앵커 1장(v1.1) 경로는 지우지 않는다 — 이미 등록해 둔 사람이 다시 스캔하기 전까지 그대로 쓴다.
export const ANGLES = ["front", "side1", "side2"] as const;
export type FaceAngle = (typeof ANGLES)[number];

const SCAN_KEY = "rimikimi_face_scan";
/** 저장 형식 판. 올리면 옛 판으로 저장된 사진을 버린다(아이폰 FaceProfileStore.version 과 같은 장치). */
const SCAN_VERSION = 1;

interface ScanRecord { version: number; consentVersion: number; consentAt: string; angles: FaceAngle[] }

interface Record_ { consentVersion: number; consentAt: string; anchor: { path: string } }

function anchorFile(): File {
  return new File(Paths.document, FILE);
}

function scanFile(a: FaceAngle): File {
  return new File(Paths.document, `face_${a}.jpg`);
}

async function readScan(): Promise<ScanRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_KEY);
    const p = raw ? (JSON.parse(raw) as ScanRecord) : null;
    if (!p || p.version !== SCAN_VERSION || p.consentVersion !== CONSENT_VERSION) return null;
    if (!Array.isArray(p.angles) || !p.angles.length) return null;
    return p;
  } catch {
    return null;
  }
}

/** 스캔 3장을 저장 — 교체는 항상 전체 교체(아이폰과 같게). */
export async function saveScanShots(shots: { angle: FaceAngle; base64: string }[]): Promise<void> {
  await deleteScan();
  const angles: FaceAngle[] = [];
  for (const s of shots) {
    const f = scanFile(s.angle);
    f.write(Uint8Array.from(atob(s.base64), (c) => c.charCodeAt(0)));
    angles.push(s.angle);
  }
  const rec: ScanRecord = {
    version: SCAN_VERSION,
    consentVersion: CONSENT_VERSION,
    consentAt: new Date().toISOString(),
    // 저장 순서 = 보내는 순서. 정면이 먼저여야 한다.
    angles: ANGLES.filter((a) => angles.includes(a)),
  };
  await AsyncStorage.setItem(SCAN_KEY, JSON.stringify(rec));
}

export async function deleteScan(): Promise<void> {
  for (const a of ANGLES) {
    try { const f = scanFile(a); if (f.exists) f.delete(); } catch { /* 무시 */ }
  }
  try { await AsyncStorage.removeItem(SCAN_KEY); } catch { /* 무시 */ }
}

/** 스캔해 둔 장수(프로필 화면 표시용). 0 이면 스캔 안 한 것. */
export async function scanCount(): Promise<number> {
  const p = await readScan();
  if (!p) return 0;
  return p.angles.filter((a) => scanFile(a).exists).length;
}

async function readRecord(): Promise<Record_ | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Record_) : null;
    if (!p || !p.anchor?.path) return null;
    return p;
  } catch {
    return null;
  }
}

export interface ProfileMeta { consentVersion: number; consentAt: string; stale: boolean; uri: string }

export async function getProfileMeta(): Promise<ProfileMeta | null> {
  const p = await readRecord();
  if (!p) return null;
  if (!anchorFile().exists) return null;
  return { consentVersion: p.consentVersion, consentAt: p.consentAt, stale: p.consentVersion !== CONSENT_VERSION, uri: anchorFile().uri };
}

export async function hasProfile(): Promise<boolean> {
  if ((await scanCount()) > 0) return true;
  const m = await getProfileMeta();
  return !!m && !m.stale;
}

/** 앵커 1장을 기기에 저장(교체는 항상 전체 교체). */
export async function saveProfile(anchor: EncodedPhoto): Promise<ProfileMeta | null> {
  await deleteProfile();
  const f = anchorFile();
  f.write(Uint8Array.from(atob(anchor.base64), (c) => c.charCodeAt(0)));
  const rec: Record_ = { consentVersion: CONSENT_VERSION, consentAt: new Date().toISOString(), anchor: { path: f.uri } };
  await AsyncStorage.setItem(KEY, JSON.stringify(rec));
  return getProfileMeta();
}

/**
 * 생성에 보낼 형태. 요청 1회에만 쓰이고 서버에 저장되지 않는다.
 * **스캔 3장이 있으면 그걸 우선**으로 보내고(아이폰과 같은 순서: 정면·옆①·옆②),
 * 없으면 예전 앵커 1장을 보낸다 — 아직 스캔 안 한 사람의 프로필이 갑자기 사라지지 않게.
 */
export async function loadProfileRefs(): Promise<(EncodedPhoto & { angle: string })[]> {
  const scan = await readScan();
  if (scan) {
    const refs: (EncodedPhoto & { angle: string })[] = [];
    for (const a of scan.angles) {
      try {
        const f = scanFile(a);
        if (f.exists) refs.push({ mimeType: "image/jpeg", base64: await f.base64(), angle: a });
      } catch {
        // 한 장을 못 읽어도 나머지는 보낸다.
      }
    }
    if (refs.length) return refs;
  }
  const p = await readRecord();
  if (!p || p.consentVersion !== CONSENT_VERSION) return [];
  try {
    const f = anchorFile();
    if (!f.exists) return [];
    return [{ mimeType: "image/jpeg", base64: await f.base64(), angle: "anchor" }];
  } catch {
    return [];
  }
}

/** 삭제 — 파일과 레코드를 함께(원자적 파기의 기기판). 스캔 3장도 **같이** 지운다. */
export async function deleteProfile(): Promise<void> {
  try { const f = anchorFile(); if (f.exists) f.delete(); } catch { /* 무시 */ }
  try { await AsyncStorage.removeItem(KEY); } catch { /* 무시 */ }
  await deleteScan();
}

/** 셀카(등록 사진) 1~5장으로 앵커를 만들어 저장. */
export async function createProfileFrom(token: string, shots: PhotoRef[]): Promise<ProfileMeta | null> {
  const encoded: EncodedPhoto[] = [];
  for (const s of shots.slice(0, 5)) encoded.push(await encodeForUpload(s, 1024));
  const anchor = await requestFaceAnchor(token, encoded);
  return saveProfile(anchor);
}
