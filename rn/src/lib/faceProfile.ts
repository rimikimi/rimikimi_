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

interface Record_ { consentVersion: number; consentAt: string; anchor: { path: string } }

function anchorFile(): File {
  return new File(Paths.document, FILE);
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

/** 생성에 보낼 형태 — [{ mimeType, base64, angle:"anchor" }]. 요청 1회에만 쓰이고 서버에 저장되지 않는다. */
export async function loadProfileRefs(): Promise<(EncodedPhoto & { angle: string })[]> {
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

/** 삭제 — 파일과 레코드를 함께(원자적 파기의 기기판). */
export async function deleteProfile(): Promise<void> {
  try { const f = anchorFile(); if (f.exists) f.delete(); } catch { /* 무시 */ }
  try { await AsyncStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 셀카(등록 사진) 1~5장으로 앵커를 만들어 저장. */
export async function createProfileFrom(token: string, shots: PhotoRef[]): Promise<ProfileMeta | null> {
  const encoded: EncodedPhoto[] = [];
  for (const s of shots.slice(0, 5)) encoded.push(await encodeForUpload(s, 1024));
  const anchor = await requestFaceAnchor(token, encoded);
  return saveProfile(anchor);
}
