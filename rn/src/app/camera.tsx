import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform, ToastAndroid } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { WebTool } from "@/ui/WebTool";
import { Screen } from "@/ui/Screen";
import { Spinner } from "@/ui/Spinner";
import { color } from "@/theme/tokens";
import { copy } from "@/lib/copy";
import { saveFileToAlbum } from "@/lib/nativeMedia";

// ============================================================================
// 카메라 — **OS 기본 카메라**를 띄운다 (오너 지시 2026-09-18: "안드로이드도 카메라는
// 네이티브 카메라로 해"). 아이폰은 이미 같은 방향으로 바뀌었다
// (ios2/rimikimi/UI/Camera/SystemCamera.swift + AppState.handleCameraShot).
//
// 왜 바꿨나 (ios2 SystemCamera.swift 의 이유와 같다)
//   그동안은 웹 CameraStudio 를 웹뷰로 띄웠다. 웹뷰 getUserMedia 로는 **터치 포커스·하드웨어
//   줌·노출 제어를 쓸 수 없다** — 아무리 손봐도 기본 카메라처럼 되지 않는다. OS 기본 카메라
//   앱은 그 기능이 전부 그대로 동작한다.
//
//   ⚠️ 맞바꾼 것: **촬영 중 라이브 필터 미리보기는 없다.** 기본 카메라 UI 위에 우리 필터를
//   얹을 방법이 없기 때문이다. 대신 찍은 직후 편집기로 넘겨 필터를 입힌다
//   (찍기 → 필터, 순서만 바뀐다).
//
// 찍은 뒤 흐름은 **웹뷰 카메라가 하던 것과 같은 결과**로 맞췄다
// (웹 src/ToolEntry.jsx CameraTool → ShotResult):
//   찍기 → 즉시 앨범 저장 → 편집기(다듬기). 웹의 ShotResult 중간 화면("다듬기 · 공유 · 닫기")은
//   없앴다 — 아이폰(handleCameraShot)이 저장 후 곧장 편집기로 넘어가고, 공유·저장·닫기는
//   편집기 안에 그대로 다 있다(PhotoEditor).
//   편집기는 2.0 에서 여전히 웹뷰다(SPEC §5 1단계) — 찍은 사진을 `__rimikimiInit` 초기
//   데이터로 실어 보낸다(WebTool initialPayload, ios2 AppState.openEditor 와 같은 규약).
// ============================================================================

/** 편집기(웹뷰)로 넘길 사진의 긴 변 상한. ios2 handlePickedPhotos 의 downscaled(maxLong: 2048) 와 같은 값 —
 *  base64 로 웹뷰에 넘기는 값이라 원본 그대로면 느리다. **앨범에는 원본**이 저장된다. */
const EDITOR_MAX_LONG = 2048;

export default function CameraScreen() {
  /** 편집기로 넘길 data URL. null 이면 아직 촬영 전(또는 저장/인코딩 중). */
  const [shot, setShot] = useState<string | null>(null);
  // 화면이 다시 마운트돼도 카메라를 두 번 띄우지 않는다.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let alive = true;

    (async () => {
      // 매니페스트에 CAMERA 권한이 있어도(app.config.ts) 런타임 승인은 별개다.
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!alive) return;
      if (!perm.granted) {
        Alert.alert("카메라 권한이 필요해요", "설정에서 카메라 접근을 허용해 주세요.", [
          { text: "확인", onPress: () => router.back() },
        ]);
        return;
      }

      // OS 기본 카메라. cameraType=back — **후면이 기본**(오너 지시, 아이폰 cameraDevice = .rear 와 같게).
      // allowsEditing=false: 기본 촬영 화면 그대로, 자르기 단계를 끼워 넣지 않는다.
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        cameraType: ImagePicker.CameraType.back,
        allowsEditing: false,
        quality: 1,
        exif: false,
      });
      if (!alive) return;
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset) {
        router.back(); // 취소 → 원래 화면으로
        return;
      }

      // ① 앨범에 원본 그대로 저장 (웹 ShotResult 가 하던 "셔터 → 즉시 앨범 저장", SPEC §3).
      //    안드로이드 카메라 결과는 앱 캐시에만 떨어지므로 우리가 직접 넣어야 앨범에 남는다.
      const saved = await saveFileToAlbum(asset.uri);
      if (!alive) return;
      // 앨범 저장 결과 고지 — 아이폰은 토스트로 알린다(AppState.handleCameraShot).
      // 이 앱엔 토스트 컴포넌트가 없어서 안드로이드 기본 토스트를 쓴다.
      // (Platform 가드: /dev 웹 프리뷰의 react-native-web 엔 ToastAndroid 가 없다.)
      if (Platform.OS === "android") {
        ToastAndroid.show("ok" in saved ? "앨범에 저장했어요" : "앨범 저장 권한이 없어요", ToastAndroid.SHORT);
      }

      // ② 편집기로 넘길 축소본(JPEG base64).
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      const actions =
        w && h && Math.max(w, h) > EDITOR_MAX_LONG
          ? [{ resize: w >= h ? { width: EDITOR_MAX_LONG } : { height: EDITOR_MAX_LONG } }]
          : [];
      try {
        const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
          compress: 0.92,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        });
        if (!alive) return;
        if (!out.base64) throw new Error("no base64");
        setShot(`data:image/jpeg;base64,${out.base64}`);
      } catch {
        if (!alive) return;
        // 편집기로 못 넘겨도 사진 자체는 앨범에 남았다 — 그것만 알리고 닫는다.
        Alert.alert("사진을 불러오지 못했어요", "앨범에 저장된 사진으로 편집기를 열어 주세요.", [
          { text: "확인", onPress: () => router.back() },
        ]);
      }
    })();

    return () => { alive = false; };
  }, []);

  if (!shot) {
    // OS 카메라가 우리 화면 위에 떠 있는 동안 보이는 바탕. 저장·인코딩 중에도 같은 화면.
    return (
      <Screen scrollModel="fixed" contentStyle={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Spinner size={28} color={color.accent} />
      </Screen>
    );
  }

  // 찍은 사진을 실은 편집기(웹 PhotoEditor). mode=edit 이라 "사진 선택" 중간 화면이 안 뜬다.
  return (
    <WebTool
      title={copy.editor.title}
      tool="filter"
      query={{ mode: "edit" }}
      initialPayload={{ mode: "edit", src: shot }}
    />
  );
}
