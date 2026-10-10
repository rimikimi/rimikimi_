import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { WebTool } from "@/ui/WebTool";
import { copy } from "@/lib/copy";
import { takeEditorPayload } from "@/lib/editorPayload";

// 편집기(다듬기·필터) — 2.0 은 웹 PhotoEditor 를 웹뷰로(SPEC §5 1단계).
// 2.1: 사진을 미리 실어 보낼 수 있다 — 결과 "다듬기" = {mode:"edit", src},
// 카메라·필터 탭 = {mode:"edit", srcs, presetKey, strength}(iOS handlePickedPhotos 와 같은 규약).
// 필터 이용권: payload 에 filtersUnlocked · trialEndsAt 를 얹고 저장 때 paywall 브리지를 받는 건 WebTool 이 한다.
export default function EditorScreen() {
  const { preset, img, devPaywall } = useLocalSearchParams<{ preset?: string; img?: string; devPaywall?: string }>();
  const [payload] = useState(() => takeEditorPayload());
  const query: Record<string, string> = {};
  if (payload) query.mode = "edit";
  if (preset) query.preset = preset;
  if (img) query.img = img;
  return (
    <WebTool
      title={copy.editor.title}
      tool="filter"
      query={Object.keys(query).length ? query : undefined}
      initialPayload={payload ?? undefined}
      devSimulatePaywall={__DEV__ && devPaywall === "1"}
    />
  );
}
