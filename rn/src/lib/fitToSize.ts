import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

// ============================================================================
// 결과 이미지 재크롭 — 웹 src/PortraitStudio.jsx 의 fitToSize()/fitToRatio() 를 그대로 옮긴 것.
// 서버가 준 결과(base64 data URL)를 표시·저장·공유 전에 이 크롭을 적용한다(generation.tsx 에서
// 생성 완료 시 1회 적용 — 결과 화면은 이미 처리된 uri 만 받는다).
//
//  · 일반 컨셉: 768×1024 로 "중앙 크롭 후 리사이즈"(CSS object-fit: cover 와 같은 방식).
//  · 사진 복원(keepRatio) 컨셉: 원본 사진과 같은 가로세로 비율로 "중앙 크롭만"(리사이즈는 안 함,
//    긴 변만 maxLong 으로 제한) — 원본 구도를 그대로 살려야 하기 때문(fitToRatio).
//
// expo-image-manipulator 는 `data:` base64 URI 를 소스로 그대로 받는다(SDK 48+). 결과는
// file:// 캐시 URI 로 나온다 — 실패하면 원본 uri 를 그대로 돌려준다(웹도 실패 시 원본 사용).
// ============================================================================

export const RESULT_W = 768;
export const RESULT_H = 1024;

function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => Image.getSize(uri, (width, height) => res({ width, height }), rej));
}

/** 목표 비율로 중앙에서 잘라낼 사각형(source 좌표계). 웹 fitToSize/fitToRatio 의 크롭 계산과 동일. */
export function centerCropRect(sw: number, sh: number, targetRatio: number): { originX: number; originY: number; width: number; height: number } {
  const srcRatio = sw / sh;
  let cw: number, ch: number;
  if (srcRatio > targetRatio) { ch = sh; cw = Math.round(sh * targetRatio); } else { cw = sw; ch = Math.round(sw / targetRatio); }
  const originX = Math.round((sw - cw) / 2);
  const originY = Math.round((sh - ch) / 2);
  return { originX, originY, width: cw, height: ch };
}

/** 일반 컨셉 결과: 768×1024 중앙 크롭 + 리사이즈(웹 fitToSize(dataUrl,768,1024,"image/png")). */
export async function fitResultToSize(uri: string, targetW = RESULT_W, targetH = RESULT_H): Promise<string> {
  try {
    const { width, height } = await getSize(uri);
    if (!width || !height) return uri;
    const rect = centerCropRect(width, height, targetW / targetH);
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: rect }, { resize: { width: targetW, height: targetH } }],
      { compress: 1, format: ImageManipulator.SaveFormat.PNG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}

/** 사진 복원 등 keepRatio 컨셉: 원본과 같은 비율로 중앙 크롭만(리사이즈 없음, 긴 변만 제한). */
export async function fitResultToRatio(uri: string, ratio: number, maxLong = 2048): Promise<string> {
  try {
    const { width, height } = await getSize(uri);
    if (!width || !height || !ratio) return uri;
    const rect = centerCropRect(width, height, ratio);
    const scale = Math.min(1, maxLong / Math.max(rect.width, rect.height));
    const outW = Math.max(1, Math.round(rect.width * scale));
    const outH = Math.max(1, Math.round(rect.height * scale));
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: rect }, { resize: { width: outW, height: outH } }],
      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}

/** 로컬 파일(등록 사진 등)의 가로/세로 비율. 실패하면 null(호출부는 768:1024 로 대체). */
export async function fileRatio(uri: string): Promise<number | null> {
  try {
    const { width, height } = await getSize(uri);
    return width && height ? width / height : null;
  } catch {
    return null;
  }
}
