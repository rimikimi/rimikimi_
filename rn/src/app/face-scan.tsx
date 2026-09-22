import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/ui/Text";
import { Spinner } from "@/ui/Spinner";
import { IconCamera } from "@/ui/icons";
import { color, radius, space } from "@/theme/tokens";
import { ANGLES, saveScanShots, type FaceAngle } from "@/lib/faceProfile";

// ============================================================================
// 얼굴 스캔 — 정면·옆①·옆② 3장을 모아 **이 기기에만** 둔다. 아이폰 `FaceScanView` 를 옮긴 것
// (오너 지시 2026-09-22 "안드로이드도 동일하게", 범위 = 완전 동일).
//
// ⚠️ 아이폰과 **한 군데 다르다**: 아이폰은 Vision 으로 각도·화질을 실시간으로 보고 조건이 맞는
//    순간을 자동으로 잡는다(셔터 없음). 안드로이드에는 그에 대응하는 게 Expo 안에 없다
//    — expo-camera 는 SDK 51 에서 얼굴 검출을 뺐고, ML Kit 은 **정지 이미지**만 본다.
//    그래서 여기서는 단계별로 안내하고 **셔터를 직접 누른다**. 모이는 결과(3각도 참조 사진)는 같다.
//    라이브 자동 촬영은 ML Kit/vision-camera 를 넣는 별도 빌드가 필요하다.
//
// 저장·전송 규약은 아이폰과 같다: 사진 3장만 앱 전용 폴더에 두고, 생성할 때만 `faceRefs` 로
// 참조 전송한다(서버는 저장하지 않는다). 얼굴 특징정보(임베딩)는 만들지 않는다.
// ============================================================================

/** 참조로 보낼 사진의 긴 변. 아이폰 `ImageUtil.jpegPayload(maxSide: 1024)` 와 같은 값. */
const REF_MAX_LONG = 1024;
const RING = 328;
const LENS = 300;

interface Shot {
  uri: string;
  width: number;
  height: number;
}

const LABEL: Record<FaceAngle, string> = { front: "정면", side1: "옆모습 ①", side2: "옆모습 ②" };
const TITLE: Record<FaceAngle, string> = {
  front: "정면을 봐주세요",
  side1: "고개를 한쪽으로 천천히",
  side2: "이제 반대쪽으로",
};
const HINT: Record<FaceAngle, string> = {
  front: "얼굴을 원 안에 꽉 채워 주세요",
  // 아이폰과 달리 자동으로 안 잡히므로 **누르라고** 말해 준다.
  side1: "45도쯤 돌린 채로 셔터를 눌러 주세요",
  side2: "아까와 반대쪽으로 돌리고 눌러 주세요",
};

export default function FaceScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);

  const [shots, setShots] = useState<Partial<Record<FaceAngle, Shot>>>({});
  const [saving, setSaving] = useState(false);
  const shooting = useRef(false);

  const done = ANGLES.every((a) => shots[a]);
  const step: FaceAngle = ANGLES.find((a) => !shots[a]) ?? "side2";

  const asked = useRef(false);
  useEffect(() => {
    // ⚠️ `canAskAgain` 만 보고 판단하면 안 된다 — 아직 한 번도 안 물어본 상태(`undetermined`)에서
    //    이 값이 false 로 오는 기기가 있다. 그러면 묻지도 않고 "설정 열기" 안내로 떨어진다.
    if (asked.current || !permission || permission.granted) return;
    if (permission.status !== "undetermined" && !permission.canAskAgain) return;
    asked.current = true;
    requestPermission();
  }, [permission, requestPermission]);

  const capture = useCallback(async () => {
    if (shooting.current || done) return;
    shooting.current = true;
    Haptics.selectionAsync().catch(() => {});
    try {
      const p = await cam.current?.takePictureAsync({ quality: 1, exif: false });
      if (p?.uri) setShots((prev) => ({ ...prev, [step]: { uri: p.uri, width: p.width ?? 0, height: p.height ?? 0 } }));
    } catch {
      // 실패해도 단계는 그대로 — 다시 누르면 된다.
    } finally {
      shooting.current = false;
    }
  }, [done, step]);

  const confirm = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 줄이면서 EXIF 방향을 **픽셀에 굽는다**. 표시로만 남은 방향은 업로드 인코딩을 지나며
      // 떨어져 나가 누운 얼굴이 참조로 가고, 그러면 얼굴이 안 지켜진다(아이폰에서 실제로 겪었다).
      const out: { angle: FaceAngle; base64: string }[] = [];
      for (const a of ANGLES) {
        const s = shots[a];
        if (!s) continue;
        // ⚠️ **긴 변** 기준으로 줄인다(아이폰 `ImageUtil.jpegPayload(maxSide: 1024)` 와 같게).
        //    `width` 만 주면 세로 사진일 때 높이가 1024 를 훌쩍 넘어 아이폰보다 큰 걸 보내게 된다.
        const long = Math.max(s.width, s.height);
        const resize =
          long > REF_MAX_LONG
            ? [{ resize: s.width >= s.height ? { width: REF_MAX_LONG } : { height: REF_MAX_LONG } }]
            : [];
        const r = await ImageManipulator.manipulateAsync(s.uri, resize, {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        });
        if (r.base64) out.push({ angle: a, base64: r.base64 });
      }
      // 한 장이라도 만들어졌으면 저장한다(아이폰도 모인 것을 그대로 저장한다).
      // ⚠️ **하나도 못 만들었으면 닫지 않는다** — 닫아 버리면 "이 얼굴로 시작하기" 를 눌렀는데
      //    프로필은 "없음" 인 채로 돌아가고, 왜 그런지 알 길이 없다.
      if (!out.length) {
        Alert.alert("사진을 저장하지 못했어요", "다시 찍어 주세요.");
        return;
      }
      await saveScanShots(out);
      router.back();
    } finally {
      setSaving(false);
    }
  }, [saving, shots]);

  const reset = useCallback(() => setShots({}), []);

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
        <Text size="headline" style={styles.onDark}>카메라 권한이 필요해요</Text>
        <Text size="footnote" style={styles.dim}>얼굴을 스캔하려면 카메라 접근을 허용해 주세요.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (permission.canAskAgain) requestPermission();
            else Linking.openSettings().catch(() => {});
          }}
          style={styles.primary}
        >
          <Text size="callout" style={styles.primaryLabel}>
            {permission.canAskAgain ? "권한 허용" : "설정 열기"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text size="footnote" style={styles.dim}>닫기</Text>
        </Pressable>
      </View>
    );
  }

  // MARK: 확인 — 3장이 다 모였을 때

  if (done) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.s5, paddingBottom: insets.bottom + space.s5 }]}>
        <View style={styles.grow} />
        <Text size="title2" style={styles.onDark}>이 얼굴을 사용할까요?</Text>
        <Text size="footnote" style={[styles.dim, styles.centered]}>
          {"이 사진들은 이 휴대폰 안에만 저장돼요.\n사진을 만들 때만 참조로 쓰이고 서버에 보관하지 않아요."}
        </Text>
        <View style={styles.slots}>
          {ANGLES.map((a) => (
            <Slot key={a} uri={shots[a]?.uri} label={LABEL[a]} size={96} />
          ))}
        </View>
        <View style={styles.grow} />
        <Pressable accessibilityRole="button" onPress={confirm} disabled={saving} style={styles.primaryWide}>
          {saving ? <Spinner size={18} color={color.accentOn} /> : <Text size="callout" style={styles.primaryLabel}>이 얼굴로 시작하기</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={reset} hitSlop={10} style={styles.textBtn}>
          <Text size="footnote" style={styles.onDark}>다시 찍기</Text>
        </Pressable>
      </View>
    );
  }

  // MARK: 스캔 중

  const progress = ANGLES.filter((a) => shots[a]).length / ANGLES.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s3, paddingBottom: insets.bottom + space.s5 }]}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text size="callout" style={styles.onDark}>닫기</Text>
        </Pressable>
      </View>

      <View style={styles.grow} />

      <View style={styles.lensWrap}>
        <View style={styles.lens}>
          {/* 전면 카메라. 거울로 보여 줘야 고개를 어느 쪽으로 돌릴지 헷갈리지 않는다. */}
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" mirror animateShutter={false} />
        </View>

        {/* ⚠️ 미리보기를 동그랗게 자를 방법이 없다 — expo-camera 의 안드로이드 미리보기는 CameraX
            `PreviewView` 기본값(PERFORMANCE = SurfaceView)이라 부모의 `borderRadius`·`overflow:hidden`
            이 안 먹고 제 레이아웃 **밖으로도** 그린다(실측: 원 오른쪽에 세로 선이 새어 나왔다).
            그래서 검은 판을 덮고 원만 뚫는다. 판을 렌즈(300)가 아니라 **고리 크기(328)** 로 잡아
            양옆 14 씩 여유를 준다 — 새어 나온 만큼까지 덮인다. */}
        <Svg width={RING} height={RING} style={styles.mask} pointerEvents="none">
          <Path d={maskPath(RING, RING, RING / 2, RING / 2, LENS / 2)} fill="#000000" fillRule="evenodd" />
        </Svg>
        {/* Face ID 등록의 그 고리 — 한 칸씩 차오른다. */}
        <Svg width={RING} height={RING} style={styles.ring} pointerEvents="none">
          <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 4} stroke="rgba(255,255,255,0.16)" strokeWidth={4} fill="none" />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RING / 2 - 4}
            stroke={color.accent}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * (RING / 2 - 4)}`}
            strokeDashoffset={`${2 * Math.PI * (RING / 2 - 4) * (1 - progress)}`}
            // 12시 방향에서 시작하게 돌린다.
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
      </View>

      <View style={styles.grow} />

      <View style={styles.copy}>
        <Text size="headline" style={styles.onDark}>{TITLE[step]}</Text>
        <Text size="footnote" style={[styles.dim, styles.centered]}>{HINT[step]}</Text>
      </View>

      <View style={styles.grow} />

      <View style={styles.slots}>
        {ANGLES.map((a) => (
          <Slot key={a} uri={shots[a]?.uri} label={LABEL[a]} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="촬영"
        onPress={capture}
        style={styles.shutterRing}
      >
        {({ pressed }) => <View style={[styles.shutterCore, pressed && styles.shutterPressed]} />}
      </Pressable>

    </View>
  );
}

/** 네모를 덮고 가운데 원만 뚫는다(evenodd 로 구멍이 된다). */
function maskPath(w: number, h: number, cx: number, cy: number, r: number): string {
  return `M0 0 H${w} V${h} H0 Z M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

/** 모아 놓은 컷 한 칸 — 아직 안 찍은 칸은 빈 자리로 둔다(아이폰 ShotSlot 과 같게). */
function Slot({ uri, label, size = 64 }: { uri?: string; label: string; size?: number }) {
  const h = Math.round((size / (3 / 4)) * 0.75);
  return (
    <View style={styles.slot}>
      <View style={[styles.slotBox, { width: size, height: h }]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: h }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
        ) : null}
      </View>
      <Text size="caption" style={uri ? styles.slotOn : styles.slotOff}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", backgroundColor: "#000000", paddingHorizontal: space.screen },
  blank: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s3, backgroundColor: "#000000" },
  grow: { flex: 1 },
  topRow: { alignSelf: "stretch", flexDirection: "row" },

  lensWrap: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  // 둥글게 자르지 않는다 — 위에 덮는 마스크가 원을 만든다(SurfaceView 는 부모 라운드가 안 먹는다).
  lens: { width: LENS, height: LENS, backgroundColor: "#111111" },
  ring: { position: "absolute", left: 0, top: 0 },
  mask: { position: "absolute", left: 0, top: 0 },

  copy: { alignItems: "center", gap: space.s2 },
  centered: { textAlign: "center" },

  slots: { flexDirection: "row", gap: space.s3, marginBottom: space.s4 },
  slot: { alignItems: "center", gap: 6 },
  slotBox: { borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  slotOn: { color: "rgba(255,255,255,0.85)" },
  slotOff: { color: "rgba(255,255,255,0.4)" },

  shutterRing: {
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

  onDark: { color: "#FFFFFF" },
  dim: { color: "rgba(255,255,255,0.72)" },
  primary: { height: 44, paddingHorizontal: space.s5, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  primaryWide: { alignSelf: "stretch", height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  primaryLabel: { color: color.accentOn },
  textBtn: { height: 44, alignItems: "center", justifyContent: "center" },
});
