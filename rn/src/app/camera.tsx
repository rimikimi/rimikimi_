import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { WebTool } from "@/ui/WebTool";
import { Screen } from "@/ui/Screen";
import { Spinner } from "@/ui/Spinner";
import { color } from "@/theme/tokens";
import { copy } from "@/lib/copy";

// 카메라 — 2.0 은 웹 CameraStudio 를 웹뷰로(SPEC §5 1단계). 2.1 에서 Skia 네이티브.
//
// 매니페스트에 CAMERA 권한은 있어도(app.config.ts) 런타임 승인은 별개다 — 웹뷰의
// getUserMedia 는 onPermissionRequest 로 자동 승인해 주지만, 그 전에 OS CAMERA 권한
// 자체가 없으면 그 요청 자체가 실패한다. 웹뷰를 띄우기 전에 먼저 물어본다.
export default function CameraScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!alive) return;
      if (perm.granted) {
        setReady(true);
      } else {
        Alert.alert("카메라 권한이 필요해요", "설정에서 카메라 접근을 허용해 주세요.", [
          { text: "확인", onPress: () => router.back() },
        ]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!ready) {
    return (
      <Screen scrollModel="fixed" contentStyle={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Spinner size={28} color={color.accent} />
      </Screen>
    );
  }
  return <WebTool title={copy.camera.title} tool="camera" />;
}
