import { useLocalSearchParams } from "expo-router";
import { WebTool } from "@/ui/WebTool";
import { copy } from "@/lib/copy";

// 편집기(다듬기·필터) — 2.0 은 웹 PhotoEditor 를 웹뷰로(SPEC §5 1단계).
export default function EditorScreen() {
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  return <WebTool title={copy.editor.title} tool="filter" query={preset ? { preset } : undefined} />;
}
