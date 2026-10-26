import { router } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import { setEditorPayload } from "@/lib/editorPayload";
import { detectFaces } from "@/ui/LiveCamera";

/** 편집기로 넘길 한 장 + 그때 고른 필터·색감. */
export interface Shot { uri: string; width: number; height: number; presetKey: string; fxAmount: number }

/**
 * 사진들을 편집기로 — 사진별 프리셋(presetKeys, srcs 와 같은 순서) + 대표 프리셋(presetKey = 첫 장) +
 * 색감(0.7×첫 장 슬라이더). iOS handlePickedPhotos/finishBurstCamera 와 같은 규약.
 * 카메라 탭(찍은 사진·앨범)과 필터 탭(적용하기 → 앨범)이 같이 쓴다.
 */
export async function openEditorWithShots(list: Shot[]): Promise<void> {
  const picked = list.slice(0, 10);
  // 1~3장 = 4096(12MP 원본 그대로) · 4~10장 = 3072 (iOS 2026-09-30 화질 결정과 같다)
  const maxLong = picked.length <= 3 ? 4096 : 3072;
  const srcs: string[] = [];
  const kept: Shot[] = [];
  for (const s of picked) {
    const long = Math.max(s.width || 0, s.height || 0);
    const actions = long > maxLong ? [{ resize: (s.width >= s.height ? { width: maxLong } : { height: maxLong }) }] : [];
    const r = await ImageManipulator.manipulateAsync(s.uri, actions, { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (r.base64) { srcs.push(`data:image/jpeg;base64,${r.base64}`); kept.push(s); }
  }
  if (!srcs.length) return;
  const presetKeys = kept.map((s) => s.presetKey || "none");
  const presetKey = presetKeys[0];
  const payload: Record<string, unknown> = { mode: "edit", srcs, presetKey, presetKeys, strength: 0.7 * (kept[0].fxAmount ?? 1) };
  // 인플: 편집기(웹)엔 쓸 만한 얼굴 검출기가 없다 — 한 장이라도 인플이면 여기서 찾아 사진별로 넘긴다.
  if (presetKeys.some((k) => k === "infl")) {
    payload.faces = await Promise.all(kept.map((s) => detectFaces(s.uri)));
  }
  setEditorPayload(payload);
  router.push({ pathname: "/editor", params: { preset: presetKey } });
}
