import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import type { PhotoRef } from "./photo";

// ============================================================================
// 정방향 맞춤 (SPEC §3 신규, 클라 부분):
//   사진이 3:4 가 아니면 제안 → ① EXIF 로 바로 세우기 ② 얼굴 기준 3:4 크롭(무료)
//   ③ "채워 맞춤"(서버 /api/generate?fit=outpaint, 1크레딧)은 버튼만.
//
// 얼굴 검출: expo-face-detector 는 SDK 51 에서 제거됐고 ML Kit 바인딩은 실빌드 검증 없이 넣지
// 않는다. `FaceDetector` 인터페이스만 두고 기본 구현은 null(=검출 없음) → 중앙·상단 가중 크롭으로
// 대체한다. ML Kit 를 붙이면 `setFaceDetector()` 로 갈아끼운다.
// EXIF: ImageManipulator 는 원본을 읽을 때 EXIF orientation 을 굽는다 — 연산 0개로 저장하면
// "바로 세운" 픽셀이 된다.
// ============================================================================

export const TARGET_RATIO = 3 / 4; // w/h
const TOLERANCE = 0.02;

export interface FaceBox { x: number; y: number; width: number; height: number }
export type FaceDetector = (uri: string) => Promise<FaceBox[]>;

let detector: FaceDetector | null = null;
export function setFaceDetector(d: FaceDetector | null) { detector = d; }
export function hasFaceDetector() { return !!detector; }

export function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => Image.getSize(uri, (width, height) => res({ width, height }), rej));
}

export function isPortrait34(w: number, h: number): boolean {
  if (!w || !h) return true;
  return Math.abs(w / h - TARGET_RATIO) <= TOLERANCE;
}

/** 3:4 가 아니면 true — 제안 시트를 띄울지 판단. */
export async function needsFit(uri: string): Promise<boolean> {
  try {
    const { width, height } = await getSize(uri);
    return !isPortrait34(width, height);
  } catch {
    return false;
  }
}

/** EXIF 바로 세우기 — 연산 없이 다시 인코딩하면 orientation 이 픽셀에 구워진다. */
export async function uprightViaExif(uri: string): Promise<PhotoRef> {
  const out = await ImageManipulator.manipulateAsync(uri, [], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

/**
 * 3:4 크롭 창을 고른다. 얼굴이 있으면 얼굴 중심을 창의 세로 38% 지점에 두고, 없으면
 * 가로 중앙 · 세로는 상단 가중(창의 위쪽 여백 = 남는 높이의 30%) — 인물 사진은 얼굴이 위쪽에 있다.
 */
export function cropRect(w: number, h: number, faces: FaceBox[] = []): { originX: number; originY: number; width: number; height: number } {
  let cw: number, ch: number;
  if (w / h > TARGET_RATIO) { ch = h; cw = Math.round(h * TARGET_RATIO); } else { cw = w; ch = Math.round(w / TARGET_RATIO); }
  let ox = Math.round((w - cw) / 2);
  let oy = Math.round((h - ch) * 0.3);
  if (faces.length) {
    const f = faces.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    const fx = f.x + f.width / 2;
    const fy = f.y + f.height / 2;
    ox = Math.round(fx - cw / 2);
    oy = Math.round(fy - ch * 0.38);
  }
  ox = Math.min(Math.max(0, ox), w - cw);
  oy = Math.min(Math.max(0, oy), h - ch);
  return { originX: ox, originY: oy, width: cw, height: ch };
}

/** 잘라 맞춤(무료): 바로 세우기 → 얼굴(또는 상단 가중) 기준 3:4 크롭. */
export async function cropToPortrait(uri: string): Promise<PhotoRef> {
  const up = await uprightViaExif(uri);
  const w = up.width ?? 0;
  const h = up.height ?? 0;
  if (!w || !h) return up;
  let faces: FaceBox[] = [];
  if (detector) {
    try { faces = await detector(up.uri); } catch { faces = []; }
  }
  const rect = cropRect(w, h, faces);
  const out = await ImageManipulator.manipulateAsync(up.uri, [{ crop: rect }], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}
