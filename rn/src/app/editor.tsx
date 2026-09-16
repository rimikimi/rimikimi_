import { useLocalSearchParams } from "expo-router";
import { WebTool } from "@/ui/WebTool";
import { copy } from "@/lib/copy";

// 편집기(다듬기·필터) — 2.0 은 웹 PhotoEditor 를 웹뷰로(SPEC §5 1단계).
export default function EditorScreen() {
  const { preset, img } = useLocalSearchParams<{ preset?: string; img?: string }>();
  const query: Record<string, string> = {};
  if (preset) query.preset = preset;
  if (img) query.img = img;
  return <WebTool title={copy.editor.title} tool="filter" query={Object.keys(query).length ? query : undefined} />;
}
