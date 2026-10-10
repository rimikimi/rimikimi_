import React from "react";
import { useLocalSearchParams } from "expo-router";
import { useStore } from "@/lib/store";
import { ConceptOptionsView } from "@/ui/ConceptOptions";

// 옵션 화면 — 본문은 ui/ConceptOptions.tsx(컨셉 훑어보기 화면과 같이 쓴다, iOS ConceptOptionsView).
export default function ConceptOptions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId } = useStore();
  return <ConceptOptionsView concept={byId(id)} />;
}
