import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useIsFocused } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { CoachAnchor, CoachHost } from "@/ui/Coach";
import { IconCameraFlip, IconFlash, IconImage } from "@/ui/icons";
import { IconFilm, IconLock, IconMirror, IconPhone, IconStarFill, IconSun } from "@/ui/icons21";
import { LiveCameraView, detectFaces, type LiveCameraHandle, type LiveReady } from "@/ui/LiveCamera";
import { Coach, useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { isKo } from "@/lib/locale";
import { pickPhotos } from "@/lib/photo";
import { saveFileToAlbum } from "@/lib/nativeMedia";
import { setEditorPayload } from "@/lib/editorPayload";
import { isPaidFilter, startFilterTrialIfNeeded, useFilterAccess } from "@/lib/iap";
import { presetByKey } from "@/filters";
import { chrome, space } from "@/theme/tokens";

// ============================================================================
// 카메라·필터 탭 — iOS 2.1 `CameraFilterTab.swift`(스노우처럼 켜자마자 카메라, 오너 지시 2026-10-09).
//  · 고른 필터가 미리보기에 실시간으로 입혀진다(로컬 모듈 modules/live-camera = CameraX + GLES 셰이더,
//    수식은 웹 filters.js). 아래 필터 줄: 원본 · ⭐ 즐겨찾기(길게 눌러 넣고 빼기) · 폰카 · 아날로그(필름+카메라+재미).
//  · "색감" 슬라이더(원본 빼고 모든 필터): 0 = 기본 카메라 색, 1 = 프리셋 색 그대로. 효과(그레인 등)는 그대로.
//  · 탭 = 그 자리 초점·노출(노란 네모), 그 뒤 화면 어디서든 위아래로 끌면 밝기(±2EV). 손 떼고 2.5초면 흐려지고
//    7초면 사라진다. 길게 누르기 = AE/AF 잠금. 두 손가락 = 줌 + 렌즈 버튼(있는 것만). 플래시. 전면 좌우반전(기본 켬, 기억).
//  · 촬영은 연속(최대 10장) → "완료 n" = 전부 앨범에 저장하고 고른 필터로 편집기에(색감 = 0.7×슬라이더).
//    로그인 없이 쓴다.
//  · 필터 이용권(scratchpad filterpass_spec.md, 원격 스위치 filterPass.enabled): 잠겨 있으면 원본 말고 모든 칩에
//    작은 자물쇠. 미리보기·찍기는 막지 않는다 — 막는 곳은 편집기 저장·공유뿐. 원본 아닌 필터를 처음 고르면 3일 무료 시작.
// ============================================================================

const MAX_SHOTS = 10;
const FAV_KEY = "filter.favorites";
const MIRROR_KEY = "camera.frontMirror";
const PHONE = ["ph16pro", "ph15pro", "ph14pro", "phxs", "ph7", "ph6s", "ph4s", "ph3gs"];
// 아날로그 = iOS FilterTabView.groups 에서 폰카를 뺀 순서(필름 → 카메라 → 재미, 빛번짐은 재미 맨 끝).
const ANALOG = [
  "golden", "peach", "slide", "retro", "vivid", "green", "pastel", "cine", "newtro", "softmono",
  "warm", "cool", "vintage", "docu", "mono", "digicam", "toy", "dispo", "instant",
  "sepia", "duopink", "neon", "thermal", "glitch", "vhs", "pixelate", "sketch", "bloom",
];
const filterName = (k: string) => { const p = presetByKey(k); return isKo ? p.ko : p.en; };

function zoomText(z: number, active: boolean): string {
  const r = Math.round(z * 10) / 10;
  const s = r === Math.round(r) || r >= 10 ? String(Math.round(r)) : r < 1 ? `.${Math.round(r * 10)}` : r.toFixed(1);
  return active ? `${s}×` : s;
}

interface FocusMark { id: number; x: number; y: number; locked: boolean; adjusting: boolean; dim: boolean; touched: number }
interface Shot { uri: string; width: number; height: number }

export default function CameraFilterTab() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const [perm, requestPerm] = useCameraPermissions();
  const { enqueueCoach, toast } = useApp21();
  const cam = useRef<LiveCameraHandle>(null);

  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);
  const asked = useRef(false);
  useEffect(() => {
    if (!focused || asked.current || !perm || perm.granted) return;
    if (perm.status !== "undetermined" && !perm.canAskAgain) return;
    asked.current = true;
    void requestPerm();
  }, [focused, perm, requestPerm]);
  useEffect(() => { if (focused) enqueueCoach(Coach.filter()); }, [focused, enqueueCoach]);

  const [selected, setSelectedState] = useState("none");
  const access = useFilterAccess();
  const lockPaid = access.enabled && !access.unlocked;
  const setSelected = useCallback((k: string) => {
    setSelectedState(k);
    if (isPaidFilter(k)) void startFilterTrialIfNeeded();
  }, []);
  const [favs, setFavs] = useState<string[]>([]);
  const [fxAmount, setFxAmount] = useState(1);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [mirror, setMirror] = useState(true);
  const [flash, setFlash] = useState(false);
  const [ready, setReady] = useState<LiveReady | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [shots, setShots] = useState<Shot[]>([]);
  const [mark, setMark] = useState<FocusMark | null>(null);
  const [locked, setLocked] = useState(false);
  const [bias, setBias] = useState(0);
  const [working, setWorking] = useState(false);
  const flashOv = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOv.value }));

  useEffect(() => {
    void AsyncStorage.getItem(FAV_KEY).then((v) => { try { const a = JSON.parse(v || "[]"); if (Array.isArray(a)) setFavs(a); } catch { /* 없음 */ } });
    void AsyncStorage.getItem(MIRROR_KEY).then((v) => { if (v === "0") setMirror(false); });
  }, []);

  const active = focused && appActive && !!perm?.granted;

  // ── 초점 표시: 손 떼고 2.5초면 흐려지고, 7초면 사라진다(잠금 중엔 흐려지기만) ──
  useEffect(() => {
    if (!mark || mark.adjusting) return;
    const t1 = setTimeout(() => setMark((m) => (m && m.id === mark.id ? { ...m, dim: true } : m)), 2500);
    const t2 = mark.locked ? null : setTimeout(() => setMark((m) => (m && m.id === mark.id && !m.adjusting ? null : m)), 7000);
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [mark?.id, mark?.touched, mark?.adjusting, mark?.locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxZoom = useMemo(() => {
    if (!ready) return 1;
    const tele = ready.lensStops.some((s) => s > 2.01);
    return Math.min(ready.maxZoom, tele ? 15 : 10);
  }, [ready]);
  const applyZoom = useCallback((z: number) => {
    const v = Math.max(ready?.minZoom ?? 1, Math.min(maxZoom, z));
    setZoomState(v);
    void cam.current?.setZoom(v);
  }, [ready, maxZoom]);

  // ── 제스처 ──
  const zoomStart = useRef(1);
  const biasStart = useRef<number | null>(null);
  const onTap = useCallback((x: number, y: number) => {
    setLocked(false);
    setBias(0);
    void cam.current?.focus(x, y, false);
    setMark({ id: Date.now(), x, y, locked: false, adjusting: false, dim: false, touched: Date.now() });
  }, []);
  const onLock = useCallback((x: number, y: number) => {
    setLocked(true);
    setBias(0);
    void cam.current?.focus(x, y, true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMark({ id: Date.now(), x, y, locked: true, adjusting: false, dim: false, touched: Date.now() });
  }, []);
  const evRange = useCallback((v: number) => {
    const lo = Math.max(-2, ready?.evMin ?? -2), hi = Math.min(2, ready?.evMax ?? 2);
    return Math.max(lo, Math.min(hi, v));
  }, [ready]);
  const markRef = useRef(mark); markRef.current = mark;
  const biasRef = useRef(bias); biasRef.current = bias;
  const onPanStart = useCallback(() => {
    if (!markRef.current) return;
    biasStart.current = biasRef.current;
  }, []);
  const onPanMove = useCallback((dy: number) => {
    if (biasStart.current == null || !markRef.current) return;
    // 화면 높이의 1/3 을 끌면 2EV — 기본 카메라 감각(iOS 와 같은 비율)
    const per = Math.max(height / 3, 200) / 2;
    const v = evRange(biasStart.current - dy / per);
    setBias(v);
    void cam.current?.setExposure(v);
    setMark((m) => (m ? { ...m, adjusting: true, dim: false, touched: Date.now() } : m));
  }, [height, evRange]);
  const onPanEnd = useCallback(() => {
    if (biasStart.current == null) return;
    biasStart.current = null;
    setMark((m) => (m ? { ...m, adjusting: false, touched: Date.now() } : m));
  }, []);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().maxDuration(300).onEnd((e, ok) => { if (ok) runOnJS(onTap)(e.x, e.y); });
    const long = Gesture.LongPress().minDuration(600).onStart((e) => { runOnJS(onLock)(e.x, e.y); });
    // 밝기 — 초점을 잡은 뒤엔 화면 어디서든 위아래로. 가로로 시작한 건 밝기가 아니다.
    const pan = Gesture.Pan().minDistance(4).activeOffsetY([-6, 6]).failOffsetX([-24, 24])
      .onStart(() => { runOnJS(onPanStart)(); })
      .onUpdate((e) => { runOnJS(onPanMove)(e.translationY); })
      .onFinalize(() => { runOnJS(onPanEnd)(); });
    const pinch = Gesture.Pinch()
      .onStart(() => { runOnJS(setPinchStart)(); })
      .onUpdate((e) => { runOnJS(setPinchScale)(e.scale); });
    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(long, tap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTap, onLock, onPanStart, onPanMove, onPanEnd]);
  // 핀치 — 시작 배율 × 손가락 간격
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const applyZoomRef = useRef(applyZoom); applyZoomRef.current = applyZoom;
  function setPinchStart() { zoomStart.current = zoomRef.current; }
  function setPinchScale(s: number) { applyZoomRef.current(zoomStart.current * s); }

  // ── 촬영 ──
  const shooting = useRef(false);
  const capture = useCallback(async () => {
    if (shooting.current || shots.length >= MAX_SHOTS || !cam.current) return;
    shooting.current = true;
    flashOv.value = withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 180 }));
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await cam.current.capture();
      setShots((prev) => (prev.length >= MAX_SHOTS ? prev : [...prev, r]));
    } catch (e) {
      if (__DEV__) console.log("[camera] capture 실패", String(e));
    } finally {
      shooting.current = false;
    }
  }, [shots.length, flashOv]);

  /** 사진들을 편집기로 — 고른 필터 + 색감(0.7×슬라이더), iOS handlePickedPhotos 와 같은 규약. */
  const openEditor = useCallback(async (list: Shot[]) => {
    const picked = list.slice(0, 10);
    // 1~3장 = 4096(12MP 원본 그대로) · 4~10장 = 3072 (iOS 2026-09-30 화질 결정과 같다)
    const maxLong = picked.length <= 3 ? 4096 : 3072;
    const srcs: string[] = [];
    for (const s of picked) {
      const long = Math.max(s.width || 0, s.height || 0);
      const actions = long > maxLong ? [{ resize: (s.width >= s.height ? { width: maxLong } : { height: maxLong }) }] : [];
      const r = await ImageManipulator.manipulateAsync(s.uri, actions, { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (r.base64) srcs.push(`data:image/jpeg;base64,${r.base64}`);
    }
    if (!srcs.length) return;
    const payload: Record<string, unknown> = { mode: "edit", srcs, presetKey: selected, strength: 0.7 * fxAmount };
    // 인플: 편집기(웹)엔 쓸 만한 얼굴 검출기가 없다 — 여기서 찾아 사진별로 넘긴다(미리보기와 같은 사각형 틀).
    if (selected === "infl") {
      payload.faces = await Promise.all(picked.map((s) => detectFaces(s.uri)));
    }
    setEditorPayload(payload);
    router.push({ pathname: "/editor", params: { preset: selected } });
  }, [selected, fxAmount]);

  const finish = useCallback(async () => {
    if (!shots.length || working) return;
    setWorking(true);
    try {
      const list = shots;
      setShots([]);
      let saved = 0;
      for (const s of list) { const r = await saveFileToAlbum(s.uri); if ("ok" in r) saved++; }
      toast(saved === list.length ? c21.savedNToAlbum(saved) : c21.noAlbumPermission);
      await openEditor(list);
    } finally {
      setWorking(false);
    }
  }, [shots, working, toast, openEditor]);

  const pickFromAlbum = useCallback(async () => {
    const picked = await pickPhotos({ multiple: true, limit: 10 });
    if (!picked.length) return;
    setWorking(true);
    try { await openEditor(picked.map((p) => ({ uri: p.uri, width: p.width ?? 0, height: p.height ?? 0 }))); }
    finally { setWorking(false); }
  }, [openEditor]);

  const toggleFav = useCallback((k: string) => {
    if (k === "none") return;
    setFavs((cur) => {
      const on = cur.includes(k);
      const next = on ? cur.filter((x) => x !== k) : [...cur, k];
      toast(on ? c21.favRemoved : c21.favAdded);
      void AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }, [toast]);

  const flip = useCallback(() => {
    setFacing((f) => (f === "back" ? "front" : "back"));
    setZoomState(1); setMark(null); setLocked(false); setBias(0); setReady(null);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const toggleMirror = useCallback(() => {
    setMirror((m) => { void AsyncStorage.setItem(MIRROR_KEY, m ? "0" : "1"); return !m; });
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const bottomPad = insets.bottom + chrome.tabBarH + chrome.tabBarBottom + space.s4;

  if (perm && !perm.granted && perm.status !== "undetermined") {
    return (
      <View style={[styles.root, styles.center, { paddingBottom: bottomPad }]}>
        <Text size="headline" style={{ color: "#FFFFFF" }}>{c21.cameraNeeded}</Text>
        <View style={{ alignSelf: "stretch", paddingHorizontal: space.screen }}>
          <Button label={c21.openSettings} full onPress={() => { if (perm.canAskAgain) void requestPerm(); else void Linking.openSettings(); }} />
        </View>
      </View>
    );
  }

  const nearStop = ready?.lensStops.length ? ready.lensStops.reduce((a, b) => (Math.abs(b - zoom) < Math.abs(a - zoom) ? b : a)) : null;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <LiveCameraView
            ref={cam}
            style={StyleSheet.absoluteFill}
            active={active}
            facing={facing}
            mirror={mirror}
            flash={flash}
            intensity={fxAmount}
            presetKey={selected}
            onReady={(e) => { setReady(e.nativeEvent); setZoomState(1); }}
          />
          {mark ? <FocusBox mark={mark} bias={bias} /> : null}
        </View>
      </GestureDetector>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }, flashStyle]} />

      {/* 위: AE/AF 잠금 · 플래시(후면) · 좌우반전(전면) */}
      <View style={[styles.top, { paddingTop: insets.top + space.s2 }]} pointerEvents="box-none">
        {facing === "back" ? (
          <Pressable accessibilityRole="button" onPress={() => { setFlash((f) => !f); Haptics.selectionAsync().catch(() => {}); }} style={styles.circleBtn}>
            <IconFlash size={20} color={flash ? "#F5C518" : "#FFFFFF"} off={!flash} />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
        {locked ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.lockTag}>
            <Text size="footnote" weight="semibold" style={{ color: "#000" }}>{c21.aeafLock}</Text>
          </Animated.View>
        ) : <View />}
        {facing === "front" ? (
          <Pressable accessibilityRole="button" accessibilityState={{ selected: mirror }} onPress={toggleMirror} style={[styles.mirrorBtn, mirror && { backgroundColor: "#FFFFFF" }]}>
            <IconMirror size={16} color={mirror ? "#000000" : "#FFFFFF"} />
            <Text size="footnote" weight="bold" style={{ color: mirror ? "#000000" : "#FFFFFF" }}>{c21.mirror}</Text>
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>

      {/* 아래: 렌즈 · 색감 · 필터 줄 · 앨범/완료 · 셔터 · 전환 */}
      <View style={[styles.bottom, { paddingBottom: bottomPad }]} pointerEvents="box-none">
        {ready && ready.lensStops.length ? (
          <View style={styles.lensRow}>
            {ready.lensStops.map((s) => {
              const on = s === nearStop;
              return (
                <Pressable key={s} onPress={() => { applyZoom(s); Haptics.selectionAsync().catch(() => {}); }} style={[styles.lens, on && styles.lensOn]}>
                  <Text size={on ? "footnote" : "caption"} weight="bold" tabular style={{ color: on ? "#F5C518" : "#FFFFFF" }}>{on ? zoomText(zoom, true) : zoomText(s, false)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {selected !== "none" ? <FxSlider value={fxAmount} onChange={setFxAmount} width={width - space.screen * 2} /> : null}
        <CoachAnchor id="filterStrip" style={{ alignSelf: "stretch" }}>
          {/* ⚠️ flexGrow 0 + 높이 고정 — 가로 ScrollView 는 기본 flexGrow:1 이라 절대배치 묶음 안에서 470px 로 부풀어
              셔터 줄이 탭바 아래로 밀려났다(에뮬레이터 uiautomator 로 확인). */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripScroll} contentContainerStyle={styles.strip}>
            <Chip k="none" label={c21.original} on={selected === "none"} onPress={setSelected} onLong={toggleFav} />
            {/* 인플(뷰티) — 원본 바로 다음(iOS 4e81f98) */}
            <Chip k="infl" label={filterName("infl")} on={selected === "infl"} onPress={setSelected} onLong={toggleFav} locked={lockPaid} />
            {favs.length ? <View style={styles.groupMark}><IconStarFill size={16} color="#F5C518" /></View> : null}
            {favs.map((k) => <Chip key={`f_${k}`} k={k} label={filterName(k)} on={selected === k} onPress={setSelected} onLong={toggleFav} locked={lockPaid} />)}
            <View style={styles.groupMark}><IconPhone size={16} color="rgba(255,255,255,0.7)" /></View>
            {PHONE.map((k) => <Chip key={k} k={k} label={filterName(k)} on={selected === k} onPress={setSelected} onLong={toggleFav} locked={lockPaid} />)}
            <View style={styles.groupMark}><IconFilm size={16} color="rgba(255,255,255,0.7)" /></View>
            {ANALOG.map((k) => <Chip key={k} k={k} label={filterName(k)} on={selected === k} onPress={setSelected} onLong={toggleFav} locked={lockPaid} />)}
          </ScrollView>
        </CoachAnchor>
        <View style={styles.controls}>
          {shots.length === 0 ? (
            <Pressable accessibilityRole="button" onPress={() => { void pickFromAlbum(); }} style={styles.side}>
              <IconImage size={24} color="#FFFFFF" />
              <Text size="caption" weight="semibold" style={{ color: "#FFFFFF" }}>{c21.album}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => { void finish(); }} style={styles.side}>
              <View style={styles.doneBtn}>
                {shots[shots.length - 1] ? <Image source={{ uri: shots[shots.length - 1].uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
              <View style={styles.donePill}><Text size="footnote" weight="bold" style={{ color: "#000" }}>{c21.burstDone(shots.length)}</Text></View>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="shutter"
            disabled={shots.length >= MAX_SHOTS || working}
            onPress={() => { void capture(); }}
            style={({ pressed }) => [styles.shutterOuter, { opacity: shots.length >= MAX_SHOTS ? 0.4 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={flip} style={styles.side}>
            <IconCameraFlip size={24} color="#FFFFFF" />
            <Text size="caption" weight="semibold" style={{ color: "#FFFFFF" }}>{c21.flip}</Text>
          </Pressable>
        </View>
      </View>
      <CoachHost keys={["filterStrip"]} />
    </View>
  );
}

function Chip({ k, label, on, onPress, onLong, locked }: { k: string; label: string; on: boolean; onPress: (k: string) => void; onLong: (k: string) => void; locked?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityHint={locked ? c21.fpLocked : undefined}
      onPress={() => { onPress(k); Haptics.selectionAsync().catch(() => {}); }}
      onLongPress={() => onLong(k)}
      delayLongPress={400}
      style={[styles.chip, on && styles.chipOn]}
    >
      {locked ? <IconLock size={11} color={on ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.75)"} /> : null}
      <Text size="footnote" weight="bold" style={{ color: on ? "#000000" : "#FFFFFF" }}>{label}</Text>
    </Pressable>
  );
}

/** 노란 초점 네모 + 해(노출) — 끄는 동안 세로 줄이 보이고 해가 줄을 따라 오르내린다(iOS 와 같다). */
function FocusBox({ mark, bias }: { mark: FocusMark; bias: number }) {
  return (
    <View pointerEvents="none" style={[styles.focusWrap, { left: mark.x - 38, top: mark.y - 60 }]}>
      <View style={[styles.focusBox, { opacity: mark.dim ? 0.5 : 1, marginTop: 22 }]} />
      <View style={styles.sunCol}>
        {mark.adjusting ? <View style={styles.sunLine} /> : null}
        <View style={[styles.sun, { transform: [{ translateY: -bias * 30 }] }, mark.adjusting && { backgroundColor: "rgba(0,0,0,0.25)" }]}>
          <IconSun size={16} color="#F5C518" />
        </View>
      </View>
    </View>
  );
}

/** 색감 슬라이더 — 0..1, 오른쪽 숫자는 0~100. */
function FxSlider({ value, onChange, width }: { value: number; onChange: (v: number) => void; width: number }) {
  const trackW = width - 120;
  const startV = useRef(value);
  const set = useCallback((v: number) => onChange(Math.max(0, Math.min(1, v))), [onChange]);
  const vRef = useRef(value); vRef.current = value;
  const begin = useCallback((x: number) => { startV.current = x / trackW; set(x / trackW); }, [trackW, set]);
  const move = useCallback((dx: number) => { set(startV.current + dx / trackW); }, [trackW, set]);
  const g = useMemo(() => Gesture.Pan().minDistance(0)
    .onBegin((e) => { runOnJS(begin)(e.x); })
    .onUpdate((e) => { runOnJS(move)(e.translationX); }), [begin, move]);
  return (
    <View style={[styles.slider, { width }]}>
      <Text size="footnote" weight="bold" style={{ color: "#FFFFFF" }}>{c21.colorAmount}</Text>
      <GestureDetector gesture={g}>
        <View style={{ width: trackW, height: 28, justifyContent: "center" }} collapsable={false}>
          <View style={styles.track} />
          <View style={[styles.trackFill, { width: trackW * value }]} />
          <View style={[styles.knob, { left: trackW * value - 11 }]} />
        </View>
      </GestureDetector>
      <Text size="footnote" weight="semibold" tabular style={{ color: "rgba(255,255,255,0.85)", width: 30, textAlign: "right" }}>{String(Math.round(value * 100))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center", gap: space.s3 },
  top: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.screen },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  lockTag: { backgroundColor: "#F5C518", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  mirrorBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.35)" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: space.s3 },
  lensRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 5, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.2)" },
  lens: { minWidth: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  lensOn: { minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 7 },
  slider: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingHorizontal: space.s4, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.3)" },
  track: { position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  trackFill: { position: "absolute", left: 0, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF" },
  knob: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 },
  stripScroll: { flexGrow: 0, height: 40, alignSelf: "stretch" },
  strip: { paddingHorizontal: space.screen, gap: space.s2, alignItems: "center" },
  groupMark: { paddingHorizontal: 2 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.14)", flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: "#FFFFFF" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch", paddingHorizontal: space.s5 },
  side: { width: 64, alignItems: "center", gap: 4 },
  doneBtn: { width: 40, height: 40, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: "#FFFFFF" },
  donePill: { position: "absolute", top: -14, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#FFFFFF" },
  focusWrap: { position: "absolute", flexDirection: "row", alignItems: "flex-start", gap: 8, width: 112, height: 120 },
  focusBox: { width: 76, height: 76, borderRadius: 4, borderWidth: 1.5, borderColor: "#F5C518" },
  sunCol: { width: 24, height: 120, alignItems: "center", justifyContent: "center" },
  sunLine: { position: "absolute", width: 1.5, height: 120, backgroundColor: "rgba(245,197,24,0.8)" },
  sun: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
