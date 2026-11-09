// ============================================================================
// 홈 날씨 연출 — iOS `UI/Ambient/RainViews.swift` 이식(2026-11-09).
//   WeatherDim       비·눈 오는 날 배경만 살짝 어둡게(해가 가려진 빛). 2초에 걸쳐 서서히.
//   useWeatherDriver 한 프레임(30fps)마다 RainWorld 를 돌리고 뒤 층·앞 층·카드 윗면 그림을 만든다.
//   WeatherCanvas    뒤 층(카드 뒤 빗줄기·눈송이·번개) / 앞 층(카드 앞 빗줄기·물보라·떨어지는 방울·녹는 눈).
//   WeatherLedge     카드 윗면 — 고인 물 또는 소복이 쌓인 눈(카드와 같이 스크롤된다).
//   useSunShadow     맑은 날 해 위치(실제 일출·일몰)에 따라 방향·길이가 바뀌는 카드 그림자. 1분마다.
// 그림은 iOS 와 같은 스프라이트(assets/rain, scripts/rain-sprites.py 로 미리 렌더한 것)를 쓴다.
// 시뮬레이션은 JS 스레드, 그림은 SkPicture 를 공유값으로 넘겨 React 를 다시 그리지 않는다.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as RNImage, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { Easing, makeMutable, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import {
  Canvas, Fill, FilterMode, Group, ImageShader, MipmapMode, Shader, useImage, PaintStyle, Picture, Skia, StrokeCap, StrokeJoin, TileMode,
  type SkCanvas, type SkImage, type SkPicture,
} from "@shopify/react-native-skia";
import { useIsFocused } from "expo-router";
import {
  beginMotion, endMotion, isWet, light, phase, simGravity, useAmbient, visual, windPush, type Weather,
} from "@/lib/ambient";
import { COLS, rainWorld, type Rect } from "@/lib/rainWorld";

// ── 스프라이트 ──────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-require-imports */
const SRC = {
  streak: [require("../../assets/rain/streak0.png"), require("../../assets/rain/streak1.png"), require("../../assets/rain/streak2.png"), require("../../assets/rain/streak3.png"), require("../../assets/rain/streak4.png")],
  crown: [require("../../assets/rain/crown0.png"), require("../../assets/rain/crown1.png"), require("../../assets/rain/crown2.png"), require("../../assets/rain/crown3.png"), require("../../assets/rain/crown4.png"), require("../../assets/rain/crown5.png")],
  flake: [require("../../assets/rain/flake0.png"), require("../../assets/rain/flake1.png"), require("../../assets/rain/flake2.png"), require("../../assets/rain/flake3.png")],
  drop: require("../../assets/rain/drop.png"),
  dropFall: require("../../assets/rain/drop_fall.png"),
  bokeh: require("../../assets/rain/flake_bokeh.png"),
  snowTex: require("../../assets/rain/snow_tex.png"),
};
/* eslint-enable @typescript-eslint/no-require-imports */
interface Sprites { streak: SkImage[]; crown: SkImage[]; flake: SkImage[]; flakeShadow: SkImage[]; drop: SkImage; dropFall: SkImage; bokeh: SkImage; snowTex: SkImage }
let sprites: Sprites | null = null;
let spritesLoading: Promise<Sprites | null> | null = null;
async function loadOne(mod: number): Promise<SkImage> {
  const uri = RNImage.resolveAssetSource(mod).uri;
  const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!img) throw new Error("sprite");
  return img;
}
function loadSprites(): Promise<Sprites | null> {
  if (sprites) return Promise.resolve(sprites);
  spritesLoading ??= (async () => {
    try {
      sprites = {
        streak: await Promise.all(SRC.streak.map(loadOne)),
        crown: await Promise.all(SRC.crown.map(loadOne)),
        flake: await Promise.all(SRC.flake.map(loadOne)),
        flakeShadow: [],
        drop: await loadOne(SRC.drop), dropFall: await loadOne(SRC.dropFall),
        bokeh: await loadOne(SRC.bokeh), snowTex: await loadOne(SRC.snowTex),
      };
      sprites.flakeShadow = sprites.flake.map(bakeShadow);
      return sprites;
    } catch { spritesLoading = null; return null; }
  })();
  return spritesLoading;
}

/**
 * 눈송이에 옅은 그늘을 미리 구워 둔다 — 화면 전체 레이어에 그림자 필터를 매 프레임 거는 대신(에뮬레이터 측정:
 * 눈 18fps·CPU 60% → 이걸로 줄임). iOS 는 그늘(0,0.5pt, 반경 1pt, rgba(51,64,89,.38))을 레이어에 건다 —
 * 눈송이가 평균 ~8pt 로 그려지니 스프라이트(40px) 기준 5배로 키운 값으로 굽는다. 결과는 PAD 만큼 넓다.
 */
const PAD = 8, SHADOW_SCALE = 5;
function bakeShadow(img: SkImage): SkImage {
  const w = img.width(), h = img.height();
  const surf = Skia.Surface.Make(w + PAD * 2, h + PAD * 2);
  if (!surf) return img;
  const c = surf.getCanvas();
  const p = Skia.Paint();
  p.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, 0.5 * SHADOW_SCALE, (1.0 * SHADOW_SCALE) / 2, (1.0 * SHADOW_SCALE) / 2, Skia.Color("rgba(51,64,89,0.38)"), null));
  c.drawImage(img, PAD, PAD, p);
  surf.flush();
  return surf.makeImageSnapshot();
}

// ── 공용 칠 ─────────────────────────────────────────────────────────
// SwiftUI blur(radius:) ≈ 가우스 표준편차 radius/2 로 맞췄다(나란히 비교해 조정).
const sig = (r: number) => r / 2;
const imgPaint = Skia.Paint();
const rect = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);
function srcOf(img: SkImage) { return rect(0, 0, img.width(), img.height()); }
function drawImg(c: SkCanvas, img: SkImage, x: number, y: number, w: number, h: number, alpha = 1) {
  imgPaint.setAlphaf(Math.max(0, Math.min(1, alpha)));
  c.drawImageRectOptions(img, srcOf(img), rect(x, y, w, h), FilterMode.Linear, MipmapMode.Linear, imgPaint);
}
function layer(c: SkCanvas, blur: number, draw: () => void, shadow?: { dy: number; r: number; color: string }) {
  const p = Skia.Paint();
  if (shadow) p.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, shadow.dy, sig(shadow.r), sig(shadow.r), Skia.Color(shadow.color), null));
  else if (blur > 0) p.setImageFilter(Skia.ImageFilter.MakeBlur(sig(blur), sig(blur), TileMode.Decal, null));
  c.saveLayer(p);
  draw();
  c.restore();
}

// ── 뒤 층·앞 층 그리기 (RainViews.swift drawStreaks·drawSplashes·drawFlakes) ─────────
function drawStreaks(c: SkCanvas, s: Sprites, front: boolean) {
  const w = rainWorld, d = w.rainDir;
  const mine = w.streaks.filter((st) => (front ? st.plane === "front" : st.plane !== "front"));
  const deg = ((Math.atan2(d.dy, d.dx) - Math.PI / 2) * 180) / Math.PI;
  const put = (st: (typeof mine)[number], width: number, alpha: number) => {
    c.save();
    c.translate(st.x, st.y);
    c.rotate(deg, 0, 0);
    // 이미지 위 = 꼬리, 아래 = 머리(빗줄기 앞쪽이 진하다)
    const img = s.streak[Math.floor(Math.abs(st.x * 7 + st.len)) % s.streak.length];
    drawImg(c, img, -width / 2, -st.len, width, st.len, alpha);
    c.restore();
  };
  layer(c, 0, () => { for (const st of mine) if (!st.near) put(st, 2.2, 0.55 * st.alpha); });
  layer(c, 0.3, () => { for (const st of mine) if (st.near && !st.macro) put(st, 3.4, 0.85 * st.alpha); });
  if (mine.some((st) => st.macro)) layer(c, 2.4, () => { for (const st of mine) if (st.macro) put(st, 7, 0.35); });
}

function drawSplashes(c: SkCanvas, s: Sprites) {
  const w = rainWorld;
  // 왕관 물보라 — 떨어진 자리에서 6프레임으로 피어나 사라진다(20pt 정사각)
  for (const r of w.rings) {
    const f = Math.min(5, Math.floor((r.age / 0.22) * 6));
    const seed = Math.floor(Math.abs(r.x * 13 + r.y * 7));
    const sc = 0.75 + (seed % 5) * 0.12;
    c.save();
    c.translate(r.x, r.y);
    c.rotate((seed % 9) - 4, 0, 0);
    c.scale(seed % 2 === 0 ? sc : -sc, sc);
    drawImg(c, s.crown[f], -10, -15.6, 20, 20);
    c.restore();
  }
  // 튀는·떨어지는 물방울 — 떨어지는 방울은 크기 제각각, 빨라질수록 늘어나고 살짝 흔들린다
  for (const p of w.splashes) {
    const v = Math.max(1, Math.hypot(p.vx, p.vy)), falling = p.life > 1;
    const wdt = falling ? Math.max(1.2, p.size > 0 ? p.size : 3.4) : 2.0;
    const h = wdt * Math.min(falling ? 2.8 : 2.4, 1 + v / (falling ? 160 : 90));
    c.save();
    c.translate(p.x, p.y);
    c.rotate(((Math.atan2(p.vy, p.vx) - Math.PI / 2 + (falling ? Math.sin(p.y * 0.09) * 0.05 : 0)) * 180) / Math.PI, 0, 0);
    drawImg(c, s.dropFall, -wdt / 2, -h / 2, wdt, h);
    c.restore();
  }
}

function drawFlakes(c: SkCanvas, s: Sprites, front: boolean) {
  const w = rainWorld;
  const mine = w.flakes.filter((f) => (front ? f.plane === "front" : f.plane !== "front"));
  // 흰 바탕에서도 보이게 아주 옅은 그늘을 깐 뒤 눈송이
  // (그늘은 bakeShadow 로 구운 스프라이트 — 그린 크기 대비 PAD 만큼 넓게 깐다)
  const k = (40 + PAD * 2) / 40;
  for (const f of mine) {
    if (f.bokeh) continue;
    const sz = f.r * 2.6 * k;
    c.save(); c.translate(f.x, f.y); c.rotate((f.phase * 0.4 * 180) / Math.PI, 0, 0);
    drawImg(c, s.flakeShadow[f.kind], -sz / 2, -sz / 2, sz, sz);
    c.restore();
  }
  if (mine.some((f) => f.bokeh)) layer(c, 1.5, () => { for (const f of mine) if (f.bokeh) drawImg(c, s.bokeh, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); });
  if (!front) return;
  // 미끄러져 떨어지는 눈 덩어리
  if (w.snowClumps.length) layer(c, 0, () => {
    for (const k of w.snowClumps) drawImg(c, s.flake[Math.floor(k.r * 10) % 4], k.x - k.r * 1.6, k.y - k.r * 1.6, k.r * 3.2, k.r * 3.2);
  }, { dy: 0.5, r: 1, color: "rgba(0,0,0,0.2)" });
  // 액자 앞면에 내려앉아 녹는 눈 — 흰 송이가 점점 투명한 물방울로
  for (const m of w.melts) {
    const l = w.ledges.get(m.id);
    if (!l) continue;
    const t = Math.min(1, m.age / 4);
    const x = l.frame.x + m.rx, y = l.frame.y + m.ry + t * 2;
    const sz = m.r * (2.4 - 1.2 * t);
    const tail = m.age > 6 ? 7 - m.age : 1;
    drawImg(c, s.flake[Math.floor(m.rx) % 4], x - sz / 2, y - sz / 2, sz, sz, (1 - t) * tail);
    const ds = m.r * 1.3;
    drawImg(c, s.drop, x - ds / 2, y - ds / 2, ds, ds, t * tail);
  }
}

function drawLightning(c: SkCanvas, W: number, H: number) {
  const w = rainWorld;
  if (w.flash <= 0.01) return;
  // 번개 — 액자 뒤 하늘이 밝아지고, 갈라지는 줄기가 번쩍(바깥 번짐 + 흰 심)
  const sky = Skia.Paint();
  sky.setColor(Skia.Color(`rgba(219,224,255,${w.flash * 0.35})`));
  c.drawRect(rect(0, 0, W, H), sky);
  for (const [blur, wmul, a] of [[9, 5, 0.45], [2.5, 2.2, 0.75], [0, 1, 1]] as const) {
    layer(c, blur, () => {
      for (const b of w.bolts) {
        const path = Skia.Path.Make();
        b.pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
        const p = Skia.Paint();
        p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(b.width * wmul); p.setStrokeCap(StrokeCap.Round); p.setStrokeJoin(StrokeJoin.Round);
        p.setColor(Skia.Color(`rgba(235,240,255,${a * w.flash})`));
        c.drawPath(path, p);
      }
    });
  }
}

// ── 카드 윗면 (LedgeShape) ──────────────────────────────────────────
const LEDGE_H = 14;
function drawLedge(c: SkCanvas, s: Sprites, levels: number[], snow: boolean, W: number) {
  const n = levels.length, H = LEDGE_H;
  if (n < 2 || W <= 0) return;
  const pts = levels.map((lv, i) => {
    const taper = Math.min(1, i / 2.5, (n - 1 - i) / 2.5); // 양끝은 표면장력으로 둥글게 꺼진다
    return { x: ((i + 0.5) / n) * W, y: H - lv * taper };
  });
  const curve = (p: ReturnType<typeof Skia.Path.Make>) => {
    for (let i = 1; i < n; i++) p.quadTo(pts[i - 1].x, pts[i - 1].y, (pts[i - 1].x + pts[i].x) / 2, (pts[i - 1].y + pts[i].y) / 2);
  };
  const body = Skia.Path.Make();
  body.moveTo(0, H); curve(body); body.lineTo(W, H); body.close();
  const surf = Skia.Path.Make();
  surf.moveTo(pts[0].x, pts[0].y); curve(surf);
  if (snow) {
    // 쌓인 눈 — 알갱이 결 텍스처 + 아래 그늘 + 윗면 반짝임
    layer(c, 0, () => {
      c.save(); c.clipPath(body, 1, true);
      drawImg(c, s.snowTex, 0, H - 12, Math.max(W, 128), 12);
      c.restore();
    }, { dy: 0.6, r: 1.6, color: "rgba(0,0,0,0.16)" });
    layer(c, 0.6, () => {
      const p = Skia.Paint(); p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(1.4); p.setColor(Skia.Color("white"));
      c.drawPath(surf, p);
    });
    const dot = Skia.Paint(); dot.setColor(Skia.Color("white"));
    for (let i = 1; i < n - 1; i += 2) if (levels[i] > 2) c.drawOval(rect(pts[i].x - 0.6 + (i % 3), pts[i].y + 1.2, 1.2, 1.2), dot);
  } else {
    // 물 — 위는 하늘빛 반사로 밝고, 아래(카드에 닿은 쪽)는 투명하게 어두운 테
    const fill = Skia.Paint();
    fill.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: H - 7 }, { x: 0, y: H },
      [Skia.Color("rgba(219,235,250,0.55)"), Skia.Color("rgba(153,179,209,0.30)"), Skia.Color("rgba(77,97,122,0.45)")], [0, 0.55, 1], TileMode.Clamp));
    c.drawPath(body, fill);
    const glint = Skia.Paint(); glint.setColor(Skia.Color("rgba(255,255,255,0.9)"));
    for (let i = 2; i < n - 2; i += 5) if (levels[i] > 1.2) c.drawOval(rect(pts[i].x - 1.4, pts[i].y + 0.6, 2.8, 0.9), glint);
    const line = Skia.Paint(); line.setStyle(PaintStyle.Stroke); line.setStrokeWidth(0.8); line.setColor(Skia.Color("rgba(255,255,255,0.9)"));
    c.drawPath(surf, line);
  }
}

/** 아무것도 없는 그림 — Picture 에 null 을 주면 Skia 가 죽는다. */
const EMPTY: SkPicture = (() => { const r = Skia.PictureRecorder(); r.beginRecording(rect(0, 0, 1, 1)); return r.finishRecordingAsPicture(); })();

// ── 카드 윗면 그림 공유값(카드별) ───────────────────────────────────
const ledgePics = new Map<string, { sv: SharedValue<SkPicture>; width: number }>();

// ── 드라이버 ────────────────────────────────────────────────────────
export interface LedgeSpec { id: string; frame: Rect }

/**
 * 홈 화면이 한 번 부른다. getLedges = 지금 화면에 보이는 카드 자리(홈 좌표, 스크롤 반영).
 * 반환한 back·front 를 WeatherCanvas 로 카드 뒤·앞에 깐다.
 */
export function useWeatherDriver(getLedges: () => LedgeSpec[]) {
  const a = useAmbient();
  const w: Weather = visual(a);
  const wet = isWet(w);
  const focused = useIsFocused();
  const back = useSharedValue<SkPicture>(EMPTY);
  const front = useSharedValue<SkPicture>(EMPTY);
  const level = useSharedValue(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const getRef = useRef(getLedges);
  getRef.current = getLedges;
  const [ready, setReady] = useState(!!sprites);
  useEffect(() => { if (wet && !ready) void loadSprites().then((s) => setReady(!!s)); }, [wet, ready]);

  // 비·눈이 오는 정도 — 날씨가 바뀌면 2초에 걸쳐 서서히
  useEffect(() => { level.value = withTiming(wet ? 1 : 0, { duration: 2000, easing: Easing.inOut(Easing.ease) }); }, [wet, level]);
  // 기울기 센서 — 비·눈 오는 홈이 보일 때만
  useEffect(() => {
    if (!(wet && focused)) return;
    beginMotion();
    return () => endMotion();
  }, [wet, focused]);

  const running = wet && focused && ready && !a.reduced && size.w > 0;
  useEffect(() => {
    if (!running || !sprites) return;
    const s = sprites;
    let raf = 0, lastDraw = 0, alive = true;
    const mode = w === "snow" ? "snow" : "rain";
    const heavy = w === "storm";
    const tick = (t: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      if (t - lastDraw < 1000 / 31) return; // 30fps
      lastDraw = t;
      const now = Date.now();
      rainWorld.wind = windPush();
      setShaderDown();
      for (const l of getRef.current()) rainWorld.report(l.id, l.frame, now);
      rainWorld.step(now, size.w, size.h, simGravity(), mode, heavy);
      const bounds = rect(0, 0, size.w, size.h);
      // 뒤 층
      const rb = Skia.PictureRecorder();
      const cb = rb.beginRecording(bounds);
      if (mode === "rain") drawStreaks(cb, s, false); else drawFlakes(cb, s, false);
      if (heavy) drawLightning(cb, size.w, size.h);
      back.value = rb.finishRecordingAsPicture();
      // 앞 층
      const rf = Skia.PictureRecorder();
      const cf = rf.beginRecording(bounds);
      if (mode === "rain") { drawStreaks(cf, s, true); drawSplashes(cf, s); } else drawFlakes(cf, s, true);
      front.value = rf.finishRecordingAsPicture();
      // 카드 윗면(그 카드가 화면에 있을 때만)
      for (const [id, lp] of ledgePics) {
        const levels = rainWorld.level(id);
        if (!levels.length) continue;
        const r = Skia.PictureRecorder();
        drawLedge(r.beginRecording(rect(-2, -4, lp.width + 4, LEDGE_H + 8)), s, levels, mode === "snow", lp.width);
        lp.sv.value = r.finishRecordingAsPicture();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [running, w, size.w, size.h, back, front]);

  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
  }, []);
  return { back, front, level, onLayout };
}

/** 카드 뒤(back)·앞(front) 그림. 화면 전체, 터치는 통과. */
export function WeatherCanvas({ pic, level }: { pic: SharedValue<SkPicture>; level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: level.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={pic} />
      </Canvas>
    </Animated.View>
  );
}

/** 비·눈 오는 날 배경만 살짝 어둡게 — 앨범·카드는 그대로(카드 뒤에 깐다). */
export function WeatherDim() {
  const a = useAmbient();
  const w = visual(a);
  const level = useSharedValue(0);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { level.value = withTiming(isWet(w) ? 1 : 0, { duration: 2000, easing: Easing.inOut(Easing.ease) }); }, [w, level]);
  const night = phase() === "night";
  const k = night ? 0.42 : w === "storm" ? 0.32 : w === "snow" ? 0.14 : 0.24;
  const style = useAnimatedStyle(() => ({ opacity: level.value * k }), [k]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgb(26,33,48)" }, style]} />;
}

/** 카드 윗면 — 카드 안(위쪽 바깥)에 붙어 카드와 같이 스크롤된다. width = 카드 폭. */
export function WeatherLedge({ id, width, radius }: { id: string; width: number; radius: number }) {
  const a = useAmbient();
  const w = visual(a);
  const wet = isWet(w);
  const inner = Math.max(0, width - radius * 2);
  const sv = useMemo(() => makeMutable<SkPicture>(EMPTY), []);
  const level = useSharedValue(0);
  useEffect(() => { level.value = withTiming(wet ? 1 : 0, { duration: 2000, easing: Easing.inOut(Easing.ease) }); }, [wet, level]);
  useEffect(() => {
    if (!wet) return;
    ledgePics.set(id, { sv, width: inner });
    return () => { if (ledgePics.get(id)?.sv === sv) ledgePics.delete(id); };
  }, [id, sv, inner, wet]);
  const style = useAnimatedStyle(() => ({ opacity: level.value }));
  if (!wet) return null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: radius, top: -LEDGE_H + 0.5, width: inner, height: LEDGE_H }, style]}>
      <Canvas style={{ position: "absolute", left: -2, top: -4, width: inner + 4, height: LEDGE_H + 8 }}>
        <Group transform={[{ translateX: 2 }, { translateY: 4 }]}>
          <Picture picture={sv} />
        </Group>
      </Canvas>
    </Animated.View>
  );
}

/** 맑은 날 광원 그림자 — 1분마다 해 위치로 다시. 카드 사진 상자 style 에 덧붙인다. */
export function useSunShadow(): ViewStyle {
  const a = useAmbient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const l = light(now, a);
  const alpha = l.opacity * (0.6 + 0.4 * l.warm);
  return { boxShadow: `${l.dx.toFixed(1)}px ${l.dy.toFixed(1)}px ${(l.radius * 2).toFixed(1)}px rgba(64,46,26,${alpha.toFixed(3)})` } as ViewStyle;
}

export { COLS };

// ── 액자 유리 빗물 (iOS WindowRain.metal → SkSL 그대로) ─────────────────────
// 격자별 큰 물방울이 맺혀 미끄러지며 자국을 남기고, 잔방울이 생겼다 사라지고, 렌즈처럼 뒤 사진을 굴절시킨다.
// '아래' = 폰 기울기. 성능 때문에 iOS 와 같이 4개 중 1개 액자에만(isWetTile).
const WINDOW_RAIN = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 size;
uniform float t;
uniform float amount;
uniform float2 down;
uniform float seed;

float3 N13(float p) {
  float3 p3 = fract(float3(p) * float3(.1031, .11369, .13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(float3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}
float N(float t) { return fract(sin(t * 12345.564) * 7658.76); }
float Saw(float b, float t) { return smoothstep(0., b, t) * smoothstep(1., b, t); }

float2 DropLayer(float2 uv, float t) {
  float2 UV = uv;
  uv.y += t * 0.75;
  float2 a = float2(6., 1.);
  float2 grid = a * 2.;
  float2 id = floor(uv * grid);
  float colShift = N(id.x);
  uv.y += colShift;
  id = floor(uv * grid);
  float3 n = N13(id.x * 35.2 + id.y * 2376.1);
  float2 st = fract(uv * grid) - float2(.5, 0);
  float x = n.x - .5;
  float y = UV.y * 20.;
  float wiggle = sin(y + sin(y));
  x += wiggle * (.5 - abs(x)) * (n.z - .5);
  x *= .7;
  float ti = fract(t + n.z);
  y = (Saw(.85, ti) - .5) * .9 + .5;
  float2 p = float2(x, y);
  float d = length((st - p) * a.yx);
  float mainDrop = smoothstep(.4, .0, d);
  float r = sqrt(smoothstep(1., y, st.y));
  float cd = abs(st.x - x);
  float trail = smoothstep(.23 * r, .15 * r * r, cd);
  float trailFront = smoothstep(-.02, .02, st.y - y);
  trail *= trailFront * r * r;
  y = UV.y;
  y = fract(y * 10.) + (st.y - .5);
  float dd = length(st - float2(x, y));
  float droplets = smoothstep(.3, 0., dd);
  float m = mainDrop + droplets * r * trailFront;
  return float2(m, trail);
}

float StaticDrops(float2 uv, float t) {
  uv *= 40.;
  float2 id = floor(uv);
  uv = fract(uv) - .5;
  float3 n = N13(id.x * 107.45 + id.y * 3543.654);
  float2 p = (n.xy - .5) * .7;
  float d = length(uv - p);
  float fade = Saw(.025, fract(t + n.z));
  return smoothstep(.3, 0., d) * fract(n.z * 10.) * fade;
}

float Water(float2 p, float4 v, float2 seedOff, float t, float l0, float l1, float l2) {
  float s = StaticDrops(p * .9 + seedOff, t) * l0;
  float m = 0.;
  if (v.y > 0.01) {
    float2 q = p * v.w * .9 + seedOff;
    m += (DropLayer(q, t).x * l1 + DropLayer(q * 1.85, t).x * l2) * v.y;
  }
  if (v.x > 0.01) {
    float2 q = float2(p.y, -p.x) * v.z * .9 + seedOff.yx + 7.3;
    m += (DropLayer(q, t).x * l1 + DropLayer(q * 1.85, t).x * l2) * v.x;
  }
  return smoothstep(.3, 1., s + m);
}

half4 main(float2 pos) {
  float2 p = (pos - size * .5) / size.y;
  p.y = -p.y;
  float dx2 = down.x * down.x, dy2 = down.y * down.y, dd = max(1e-4, dx2 + dy2);
  float4 v = float4(dx2 / dd, dy2 / dd, down.x >= 0. ? 1. : -1., down.y >= 0. ? 1. : -1.);
  float2 seedOff = float2(seed * 3.17, seed * 1.73);
  float T = t * .2;
  float rain = clamp(amount, 0., 1.);
  float l0 = smoothstep(-.5, 1., rain) * 0.9;
  float l1 = smoothstep(.25, .75, rain);
  float l2 = smoothstep(.0, .5, rain);
  float c = Water(p, v, seedOff, T, l0, l1, l2);
  if (c < 0.001) return image.eval(pos);
  float e = .001;
  float cx = Water(p + float2(e, 0.), v, seedOff, T, l0, l1, l2);
  float cy = Water(p + float2(0., e), v, seedOff, T, l0, l1, l2);
  float2 n = float2(cx - c, cy - c);
  float2 off = n * size.y * 1.6;
  off.y = -off.y;
  half4 col = image.eval(pos + off);
  float edge = smoothstep(.0, .4, length(n) * 60.);
  col.rgb *= half(1. - .18 * edge * c);
  col.rgb += half3(.07 * c * smoothstep(.7, 1., c));
  return col;
}
`);

/**
 * 액자 유리 빗물 스위치. 2026-11-09 에뮬레이터(-gpu host) 측정: 비 + 유리 빗물 = 프레임 중간 29ms·90% 61ms·CPU 138%
 * (유리 빗물 없이 비만 = 16ms·30%). 에뮬레이터는 실기기 GPU 를 대표하지 못해 **실기기(갤럭시)에서 재고 판단**한다.
 * 버벅이면 false — 나머지(비·눈·번개·윗면 물·그림자)는 그대로 돈다.
 */
export const WET_GLASS = true;

/** 물 묻는 액자 — 4개 중 1개꼴, 이름으로 고정(스크롤해도 같은 액자가 젖어 있다). iOS FaceWaterModifier.isWet 과 같은 FNV. */
export function isWetTile(id: string): boolean {
  let h = 2166136261;
  for (const b of new TextEncoder().encode(id)) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h % 4 === 0;
}

/** 셰이더가 읽는 '아래' 방향 — 드라이버가 매 프레임 넣는다. */
const downSV = makeMutable<[number, number]>([0, 1]);
export function setShaderDown() {
  const g = simGravity();
  const gl = Math.max(0.2, Math.hypot(g.dx, g.dy));
  const d: [number, number] = [g.dx / gl, Math.max(0.15, g.dy) / gl];
  const [px, py] = downSV.value;
  if (Math.abs(d[0] - px) > 0.02 || Math.abs(d[1] - py) > 0.02) downSV.value = d; // 거의 같으면 다시 그리지 않는다
}

/** 비·뇌우일 때 젖은 액자의 사진 위에 굴절 빗물을 그린다(사진 Image 바로 위, 글자 아래에 둔다). */
export function WetCover({ id, uri, width, height }: { id: string; uri?: string; width: number; height: number }) {
  const a = useAmbient();
  const w = visual(a);
  const rainy = WET_GLASS && (w === "rain" || w === "storm") && isWetTile(id) && !a.reduced;
  const img = useImage(rainy && uri ? uri : null);
  const lvl = useSharedValue(0);
  useEffect(() => { lvl.value = withTiming(rainy ? 1 : 0, { duration: 2000, easing: Easing.inOut(Easing.ease) }); }, [rainy, lvl]);
  const k = w === "storm" ? 0.4 : 0.24;
  const seed = useMemo(() => { let h = 2166136261; for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return (h % 97) / 97; }, [id]);
  // 시간은 초당 24번만 바뀌게(iOS minimumInterval 1/24) — 값이 실제로 바뀔 때만 다시 그린다.
  // (워클릿 안에 // 주석을 넣으면 한 줄로 직렬화될 때 뒤 속성이 잘린다 — 실제로 'amount' 가 빠졌다.)
  const tq = useSharedValue(0);
  useFrameCallback((f) => {
    const q = (Math.floor(f.timestamp / (1000 / 24)) / 24) % 10000;
    if (q !== tq.value) tq.value = q;
  }, rainy);
  const uniforms = useDerivedValue(() => ({ size: [width, height], t: tq.value, amount: lvl.value * k, down: downSV.value, seed }));
  if (!rainy || !img || !WINDOW_RAIN) return null;
  return (
    <Canvas pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height }}>
      <Fill>
        <Shader source={WINDOW_RAIN} uniforms={uniforms}>
          <ImageShader image={img} fit="cover" rect={{ x: 0, y: 0, width, height }} />
        </Shader>
      </Fill>
    </Canvas>
  );
}
