import { WebTool } from "@/ui/WebTool";
import { copy } from "@/lib/copy";

// 카메라 — 2.0 은 웹 CameraStudio 를 웹뷰로(SPEC §5 1단계). 2.1 에서 Skia 네이티브.
export default function CameraScreen() {
  return <WebTool title={copy.camera.title} tool="camera" />;
}
