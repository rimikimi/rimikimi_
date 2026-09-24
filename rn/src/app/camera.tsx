import React, { useCallback, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, ToastAndroid, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebTool } from "@/ui/WebTool";
import { Text } from "@/ui/Text";
import { Spinner } from "@/ui/Spinner";
import { IconCamera, IconCameraFlip, IconClose, IconFlash } from "@/ui/icons";
import { color, radius, space } from "@/theme/tokens";
import { ease } from "@/theme/motion";
import { copy } from "@/lib/copy";
import { saveFileToAlbum } from "@/lib/nativeMedia";
import { photoHeight } from "@/ui/Thumb";

// ============================================================================
// 연속 촬영 카메라 — 셔터를 여러 번 눌러 **한 번에 최대 10장**까지 찍고, 그대로 편집기로
// 넘겨 필터를 통째로 입힌다. 아이폰 `BurstCameraView`/`BurstCameraModel` 을 그대로 옮긴 것
// (오너 지시 2026-09-22 "안드로이드도 동일하게", 범위 = 완전 동일).
//
// 왜 OS 기본 카메라를 안 쓰나
//   기본 카메라는 **한 장 찍으면 바로 앱으로 돌아온다** — 연속 촬영을 시킬 방법이 없다.
//   `expo-image-picker` 를 열 번 다시 띄우는 것도 그때마다 확인 화면을 거치게 돼 같은 얘기다.
//   아이폰도 정확히 이 이유로 이 화면만 직접 만들었다(BurstCamera.swift 머리말).
//   2026-09-18 "카메라는 네이티브 카메라로" 지시는 **한 장짜리 경로**에 대한 것이었고,
//   필터 탭의 카메라 버튼은 2026-09-22 부터 연속 촬영으로 간다(ios2 AppState `.camera`).
//
//   ⚠️ 맞바꾼 것은 그대로다: **촬영 중 라이브 필터 미리보기는 없다.** 찍고 나서 필터를 입힌다.
//
// 찍은 뒤 흐름(웹 ShotResult · 아이폰 finishBurstCamera 와 같은 결과):
//   찍기 → 완료 → 전부 앨범에 저장 → 편집기(여러 장을 한 번에)
// ============================================================================

const MAX_SHOTS = 10;

/** 편집기(웹뷰)로 넘길 사진의 긴 변 상한. ios2 handlePickedPhotos 의 downscaled(maxLong: 2048) 와 같은 값 —
 *  base64 로 웹뷰에 넘기는 값이라 원본 그대로면 느리다. **앨범에는 원본**이 저장된다. */
const EDITOR_MAX_LONG = 2048;

/** 찍은 컷 미리보기 한 칸의 가로. 세로는 3:4 (앱 전체와 같은 비율). */
const STRIP_W = 44;

interface Shot {
  uri: string;
  width: number;
  height: number;
}

/** 워크릿에서도 부르므로 `"worklet"` 을 붙인다 — 없으면 UI 스레드에서 못 찾는다. */
function clamp01(v: number): number {
  "worklet";
  return Math.min(1, Math.max(0, v));
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>("back");
  const [flashOn, setFlashOn] = useState(false);
  /** expo-camera 의 zoom 은 **0~1 = 기기 최대 배율의 비율**이다(배율 factor 가 아니다). */
  const [zoom, setZoom] = useState(0);
  // ⚠️ 핀치가 시작될 때의 줌은 **shared value** 로 들고 있는다. `useRef` 로 두면 워크릿이
  //    제스처를 만들 때의 값을 붙들고 있어서 두 번째 핀치부터 처음 값으로 되돌아간다.
  const zoomBase = useSharedValue(0);
  /** 핀치가 도는 동안의 값 — 취소돼도 마지막 값을 기준값으로 굳히기 위해 따로 둔다. */
  const zoomLive = useSharedValue(0);
  const [shots, setShots] = useState<Shot[]>([]);
  /** 편집기로 넘길 data URL 들. 비어 있지 않으면 편집기로 넘어간 것이다. */
  const [srcs, setSrcs] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  /** 셔터 연타로 같은 장면이 두 번 들어오지 않게. */
  const shooting = useRef(false);

  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const full = shots.length >= MAX_SHOTS;

  // 화면에 들어오면 바로 권한을 묻는다(아이폰도 화면이 뜨면서 묻는다). 이미 거절했으면
  // 시스템이 다시 묻지 않으므로 아래 안내 화면에서 설정으로 보낸다.
  const asked = useRef(false);
  React.useEffect(() => {
    // ⚠️ `canAskAgain` 만 보면 안 된다 — 아직 안 물어본 상태(`undetermined`)에서 false 로 오는
    //    기기가 있어서, 묻지도 않고 "설정 열기" 안내로 떨어진다.
    if (asked.current || !permission || permission.granted) return;
    if (permission.status !== "undetermined" && !permission.canAskAgain) return;
    asked.current = true;
    requestPermission();
  }, [permission, requestPermission]);

  // MARK: 촬영

  const capture = useCallback(async () => {
    if (shooting.current || full) return;
    shooting.current = true;
    // 셔터를 누른 순간 화면이 한 번 반짝인다(실제로 찍혔다는 신호) — 아이폰 flashOverlay 와 같다.
    flash.value = withTiming(0.85, { duration: 60, easing: ease.standard }, () => {
      flash.value = withTiming(0, { duration: 160, easing: ease.standard });
    });
    Haptics.selectionAsync().catch(() => {});
    try {
      // skipProcessing 은 **끄고** 둔다(기본값) — 켜면 EXIF 방향이 불확실해진다(expo-camera 주석).
      // 셔터음은 건드리지 않는다 — 아이폰도 시스템 셔터음을 그대로 내고, 한국 판매 기기는
      // OS 가 강제해서 끄지도 못한다.
      const p = await cam.current?.takePictureAsync({ quality: 1, exif: false });
      if (p?.uri) {
        setShots((prev) => (prev.length >= MAX_SHOTS ? prev : [...prev, { uri: p.uri, width: p.width ?? 0, height: p.height ?? 0 }]));
      }
    } catch (e) {
      // 한 장 실패해도 화면은 유지한다 — 다시 누르면 된다. 다만 **조용히 삼키지는 않는다** —
      // 에뮬레이터에서 촬영이 안 되는데 아무 흔적이 없어 한참 헤맸다.
      if (__DEV__) console.log("[camera] takePicture 실패", String(e));
    } finally {
      shooting.current = false;
    }
  }, [flash, full]);

  const remove = useCallback((i: number) => {
    setShots((prev) => prev.filter((_, n) => n !== i));
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const flip = useCallback(() => {
    setFacing((f) => (f === "back" ? "front" : "back"));
    setZoom(0);
    zoomBase.value = 0;
    zoomLive.value = 0;
    Haptics.selectionAsync().catch(() => {});
  }, [zoomBase, zoomLive]);

  // MARK: 줌 — 손가락 간격의 배수를 0~1 로 옮긴다.

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          zoomLive.value = zoomBase.value;
        })
        // scale 1 → 그대로, 2배로 벌리면 0.5 만큼 더 당긴다. 기기 최대 배율을 알 방법이 없어서
        // (expo-camera 가 안 준다) **배율 숫자를 지어내지 않고** 0~1 비율로만 다룬다.
        .onUpdate((e) => {
          zoomLive.value = clamp01(zoomBase.value + (e.scale - 1) * 0.5);
          runOnJS(setZoom)(zoomLive.value);
        })
        // `onEnd` 가 아니라 `onFinalize` — 핀치가 취소되면 `onEnd` 는 안 불린다. 그러면 화면은
        // 당겨진 채인데 기준값만 옛날 것으로 남아 다음 핀치가 뚝 튄다.
        .onFinalize(() => {
          zoomBase.value = zoomLive.value;
        }),
    [zoomBase, zoomLive],
  );

  // MARK: 완료 — 앨범 저장 + 편집기로

  const finish = useCallback(async () => {
    if (!shots.length || working) return;
    setWorking(true);
    // ① 앨범에 원본 그대로 (웹 ShotResult 의 "셔터 → 즉시 앨범 저장", SPEC §3).
    //    expo-camera 결과는 앱 캐시에만 떨어지므로 직접 넣어야 앨범에 남는다.
    let saved = 0;
    for (const s of shots) {
      const r = await saveFileToAlbum(s.uri);
      if ("ok" in r) saved += 1;
    }
    if (Platform.OS === "android") {
      ToastAndroid.show(
        saved === shots.length ? copy.shoot.savedN(saved) : copy.shoot.noAlbumPerm,
        ToastAndroid.SHORT,
      );
    }

    // ② 편집기로 넘길 축소본(JPEG base64).
    const out: string[] = [];
    for (const s of shots.slice(0, MAX_SHOTS)) {
      const long = Math.max(s.width, s.height);
      const actions =
        long > EDITOR_MAX_LONG
          ? [{ resize: s.width >= s.height ? { width: EDITOR_MAX_LONG } : { height: EDITOR_MAX_LONG } }]
          : [];
      try {
        // ⚠️ 줄일 게 없어도 **그냥 통과시키지 않는다** — 이 한 번이 EXIF 방향을 픽셀에 굽는다.
        //    표시만 남은 방향은 웹뷰로 넘어가며 떨어져 나가 사진이 눕는다(아이폰 얼굴 스캔에서 겪었다).
        const r = await ImageManipulator.manipulateAsync(s.uri, actions, {
          compress: 0.92,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        });
        if (r.base64) out.push(`data:image/jpeg;base64,${r.base64}`);
      } catch {
        // 한 장을 못 넘겨도 나머지는 넘긴다 — 원본은 이미 앨범에 있다.
      }
    }
    if (!out.length) {
      setWorking(false);
      router.back();
      return;
    }
    setSrcs(out);
  }, [shots, working]);

  // MARK: 화면

  // 찍은 걸 다 넘겼으면 편집기(웹 PhotoEditor). mode=edit 이라 "사진 선택" 중간 화면이 안 뜬다.
  if (srcs) {
    return (
      <WebTool
        title={copy.editor.title}
        tool="filter"
        query={{ mode: "edit" }}
        // 여러 장 규약은 `srcs` — 아이폰 handlePickedPhotos 와 같다(웹 PhotoEditor 가 이미 받는다).
        initialPayload={{ mode: "edit", srcs }}
      />
    );
  }

  if (!permission) {
    return (
      <View style={styles.blank}>
        <Spinner size={28} color={color.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.blank, { paddingHorizontal: space.screen }]}>
        <IconCamera size={32} color="rgba(255,255,255,0.6)" />
        <Text size="headline" style={styles.onDarkTitle}>{copy.shoot.permTitle}</Text>
        <Text size="footnote" style={styles.onDarkBody}>
          {copy.shoot.permDesc}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // 한 번 거절한 뒤에는 다시 물어도 시스템이 바로 거절한다 — 그때는 설정으로 보낸다.
            if (permission.canAskAgain) requestPermission();
            else Linking.openSettings().catch(() => {});
          }}
          style={styles.settingsBtn}
        >
          <Text size="callout" style={styles.settingsLabel}>
            {permission.canAskAgain ? copy.ui.allowPermission : copy.ui.openSettings}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text size="footnote" style={styles.onDarkBody}>{copy.common.close}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pinch}>
        <CameraView
          ref={cam}
          style={StyleSheet.absoluteFill}
          facing={facing}
          zoom={zoom}
          // 전면은 **보이는 대로(거울)** 저장한다 — 셀카는 화면에서 본 그대로가 기대값이다(아이폰과 같게).
          mirror={facing === "front"}
          // 전면엔 하드웨어 플래시가 없다. 아이폰도 후면일 때만 요청한다.
          flash={flashOn && facing === "back" ? "on" : "off"}
          animateShutter={false}
        />
      </GestureDetector>

      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />

      {/* 조작부 */}
      {/* ⚠️ `box-none` — 이 판은 화면 전체를 덮는다. 스스로 터치를 받으면 아래 미리보기에 건
          핀치가 통째로 막힌다. 버튼들(자식)은 그대로 눌린다. */}
      <View
        pointerEvents="box-none"
        style={[styles.controls, { paddingTop: insets.top + space.s3, paddingBottom: insets.bottom + space.s5 }]}
      >
        {/* 아래 두 줄과 사이 여백까지 전부 터치를 통과시킨다 — 안 그러면 화면 위아래에서 핀치가 죽는다. */}
        <View pointerEvents="box-none" style={styles.topRow}>
          <GlassButton label={copy.common.close} onPress={() => router.back()}>
            <IconClose size={20} color="#FFFFFF" />
          </GlassButton>
          <View pointerEvents="none" style={styles.grow}>
            {zoom > 0.01 ? (
              <View style={styles.zoomPill}>
                {/* 기기 최대 배율을 못 받아오므로 "몇 배"가 아니라 **최대 대비 얼마나** 당겼는지를 보인다. */}
                <Text size="footnote" style={styles.onPhoto}>{copy.shoot.zoom(Math.round(zoom * 100))}</Text>
              </View>
            ) : null}
          </View>
          {facing === "back" ? (
            <GlassButton label={flashOn ? copy.shoot.flashOff : copy.shoot.flashOn} onPress={() => setFlashOn((v) => !v)}>
              <IconFlash size={20} color={flashOn ? "#F5B301" : "#FFFFFF"} off={!flashOn} />
            </GlassButton>
          ) : (
            <View style={styles.glassSlot} />
          )}
        </View>

        <View pointerEvents="none" style={styles.grow} />

        {shots.length ? (
          // 찍은 컷 — 탭하면 지운다(잘못 찍은 걸 그 자리에서 버릴 수 있게).
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            style={{ flexGrow: 0 }}
          >
            {shots.map((s, i) => (
              <Pressable
                key={s.uri}
                accessibilityRole="button"
                accessibilityLabel={copy.shoot.removeNth(i + 1)}
                onPress={() => remove(i)}
                style={styles.stripCell}
              >
                <Image
                  source={{ uri: s.uri }}
                  style={{ width: STRIP_W, height: photoHeight(STRIP_W), borderRadius: 8 }}
                  contentFit="cover"
                  transition={0}
                  cachePolicy="memory-disk"
                  recyclingKey={s.uri}
                />
                <View style={styles.stripX}>
                  <IconClose size={16} color="#FFFFFF" />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Text pointerEvents="none" size="footnote" style={styles.hint}>
          {full ? copy.shoot.full : copy.shoot.hint}
        </Text>

        <View pointerEvents="box-none" style={styles.bottomRow}>
          <View pointerEvents="box-none" style={styles.side}>
            <GlassButton label={copy.shoot.flip} onPress={flip}>
              <IconCameraFlip size={20} color="#FFFFFF" />
            </GlassButton>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.shoot.shutter}
            onPress={capture}
            disabled={full || working}
            style={[styles.shutterRing, (full || working) && styles.shutterOff]}
          >
            {/* 누르면 안쪽 원만 살짝 줄었다 돌아온다(아이폰 ShutterButton 과 같은 반응). */}
            {({ pressed }) => <View style={[styles.shutterCore, pressed && styles.shutterPressed]} />}
          </Pressable>

          <View pointerEvents="box-none" style={styles.side}>
            {shots.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.shoot.doneA11y(shots.length)}
                onPress={finish}
                disabled={working}
                style={({ pressed }) => [styles.done, pressed && { opacity: 0.9 }]}
              >
                {working ? (
                  <Spinner size={16} color={color.accentOn} />
                ) : (
                  <Text size="callout" style={styles.doneLabel}>{copy.shoot.done(shots.length)}</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/** 카메라 화면 위에 얹는 어두운 유리 원 버튼(아이폰 CircleGlassButton 자리). */
function GlassButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.glass, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  blank: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s3, backgroundColor: "#000000" },
  flash: { backgroundColor: "#FFFFFF" },

  // `StyleSheet.absoluteFillObject` 는 이 RN 타입에 없다 — 좌표를 직접 준다(앞서 겪었다).
  controls: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, paddingHorizontal: space.screen },
  topRow: { flexDirection: "row", alignItems: "center" },
  grow: { flex: 1, alignItems: "center" },
  glass: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  glassSlot: { width: 40, height: 40 },
  zoomPill: { height: 28, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.35)" },

  strip: { gap: space.s2, paddingBottom: space.s3 },
  stripCell: { borderRadius: 8, overflow: "visible" },
  stripX: { position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" },

  hint: { color: "rgba(255,255,255,0.75)", textAlign: "center", marginBottom: space.s3 },

  // 좌우 칸 폭이 같고 `space-between` 이면 가운데 것이 저절로 화면 한가운데에 선다.
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // 좌우 칸을 같은 폭으로 못 박아야 셔터가 화면 한가운데에 선다(아이폰에서 겪은 것과 같은 함정).
  side: { width: 84, alignItems: "center", justifyContent: "center" },
  shutterRing: {
    // ⚠️ `flex:1 + maxWidth` 로 두면 남는 공간의 **시작점**에 붙어 왼쪽으로 쏠린다(실측).
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterCore: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFFFFF" },
  shutterPressed: { transform: [{ scale: 0.88 }] },
  shutterOff: { opacity: 0.35 },

  done: { height: 40, minWidth: 68, paddingHorizontal: space.s3, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  doneLabel: { color: color.accentOn },

  onPhoto: { color: "#FFFFFF" },
  onDarkTitle: { color: "#FFFFFF" },
  onDarkBody: { color: "rgba(255,255,255,0.7)", textAlign: "center" },
  settingsBtn: { height: 44, paddingHorizontal: space.s5, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  settingsLabel: { color: color.accentOn },
});
