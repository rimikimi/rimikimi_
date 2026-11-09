// ============================================================================
// 홈 앨범 '창문' 날씨 — iOS `UI/Ambient/Ambient.swift` 이식(2026-11-09 오너 "해바바").
//
// - 날씨·일출·일몰: 서버 `/api/ambient`(접속 IP 대략 좌표 → Open-Meteo). 위치 권한 안 묻는다. 10분 캐시,
//   날짜가 바뀌면 바로 다시, 서버가 못 받았으면(known=false) 캐시하지 않는다.
// - 기울기: 가속도계(expo-sensors) 저역 통과 → 화면 좌표 중력(오른쪽 +x, 아래 +y). React 상태가 아니라
//   모듈 변수 — 초당 30번 바뀌는 값이 화면을 다시 그리게 하면 안 된다(iOS @ObservationIgnored 와 같은 이유).
// - 동작 줄이기(접근성)면 움직임을 끈다. (iOS 의 저전력 모드 판정은 안드로이드에선 아직 안 한다.)
// - 설정 '날씨 효과' 토글(기본 켬) — 끄면 비·눈·번개·어둡게·햇빛 그림자 없음, 추천 무드는 그대로.
// ============================================================================
import { useSyncExternalStore } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getEnv } from "./env";

export type Weather = "clear" | "cloud" | "rain" | "snow" | "fog" | "storm";
const WEATHERS: Weather[] = ["clear", "cloud", "rain", "snow", "fog", "storm"];
export interface Mood { tod?: string; wx?: string }
export interface Vec { dx: number; dy: number }

const EFFECTS_KEY = "ambient.effects";
const PREVIEW_KEY = "ambient.preview";

interface State {
  weather: Weather;
  sunrise: number | null; // ms
  sunset: number | null;
  wind: number;
  windDir: number;
  preview: Weather | null;
  previewWind: number | null;
  effectsOn: boolean;
  reduced: boolean;
}

let state: State = {
  weather: "clear", sunrise: null, sunset: null, wind: 0, windDir: 0,
  preview: null, previewWind: null, effectsOn: true, reduced: false,
};
const listeners = new Set<() => void>();
function set(p: Partial<State>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
  applyMotion();
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function getAmbient(): State { return state; }
export function useAmbient(): State { return useSyncExternalStore(subscribe, getAmbient, getAmbient); }

/** 화면에 쓸 날씨 — 미리보기 강제가 있으면 그것. */
export function current(s: State = state): Weather { return s.preview ?? s.weather; }
/** 화면 효과에 쓸 날씨 — 효과를 끄면 아무 효과 없는 '흐림'. */
export function visual(s: State = state): Weather { return s.effectsOn ? current(s) : "cloud"; }
export function isWet(w: Weather): boolean { return w === "rain" || w === "snow" || w === "storm"; }

// ── 시작: 저장된 토글·미리보기 + 접근성 ─────────────────────────────
let booted = false;
export function bootAmbient() {
  if (booted) return;
  booted = true;
  void (async () => {
    try {
      const e = await AsyncStorage.getItem(EFFECTS_KEY);
      // 미리보기는 개발 빌드에서만 남긴다(iOS: TestFlight 전용 — 출시 빌드에 가짜 비가 남던 문제, 10/23).
      const p = __DEV__ ? await AsyncStorage.getItem(PREVIEW_KEY) : null;
      if (!__DEV__) AsyncStorage.removeItem(PREVIEW_KEY).catch(() => undefined);
      set({ effectsOn: e == null ? true : e === "1", preview: WEATHERS.includes(p as Weather) ? (p as Weather) : null });
    } catch { /* 기본값 */ }
  })();
  AccessibilityInfo.isReduceMotionEnabled().then((r) => set({ reduced: r }), () => undefined);
  AccessibilityInfo.addEventListener("reduceMotionChanged", (r) => set({ reduced: r }));
  AppState.addEventListener("change", (s) => {
    appActive = s === "active";
    applyMotion();
    if (appActive) void refreshAmbient();
  });
}

export function setEffectsOn(on: boolean) {
  AsyncStorage.setItem(EFFECTS_KEY, on ? "1" : "0").catch(() => undefined);
  set({ effectsOn: on });
}
/** 개발용 강제 — null = 실제 날씨. */
export function setPreview(w: Weather | null, wind?: number | null) {
  AsyncStorage.setItem(PREVIEW_KEY, w ?? "").catch(() => undefined);
  set({ preview: w, previewWind: wind ?? null });
}

// ── 날씨 받기 ─────────────────────────────────────────────────────
let lastFetch = 0;
let lastFetchDay = -1;
let inflight: Promise<void> | null = null;
const dayIndex = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

export function refreshAmbient(): Promise<void> {
  const today = dayIndex();
  if (Date.now() - lastFetch < 600_000 && lastFetchDay === today) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`${getEnv().apiBase}/api/ambient`, { cache: "no-cache", signal: ctl.signal });
      clearTimeout(t);
      if (r.status !== 200) return;
      const j = await r.json() as { weather?: string; sunrise?: number; sunset?: number; wind?: number; windDir?: number; known?: boolean };
      set({
        weather: WEATHERS.includes(j.weather as Weather) ? (j.weather as Weather) : "clear",
        sunrise: typeof j.sunrise === "number" ? j.sunrise * 1000 : null,
        sunset: typeof j.sunset === "number" ? j.sunset * 1000 : null,
        wind: j.wind ?? 0, windDir: j.windDir ?? 0,
      });
      if (j.known !== false) { lastFetch = Date.now(); lastFetchDay = today; }
    } catch { /* 다음 기회에 */ } finally { inflight = null; }
  })();
  return inflight;
}

// ── 기울기 ────────────────────────────────────────────────────────
let gravity: Vec = { dx: 0, dy: 1 };
let fakeGravity: Vec | null = null;
let motionWanted = false;
let appActive = true;
let sub: { remove: () => void } | null = null;

export function setFakeGravity(g: Vec | null) { fakeGravity = g; }
export function beginMotion() { motionWanted = true; applyMotion(); }
export function endMotion() { motionWanted = false; applyMotion(); }

/** 원하는 상태대로 센서를 켜거나 끈다 — 몇 번을 불러도 같은 결과(멱등). */
function applyMotion() {
  const on = motionWanted && appActive && state.effectsOn && !state.reduced;
  if (on === !!sub) return;
  if (!on) { sub?.remove(); sub = null; return; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Accelerometer } = require("expo-sensors") as typeof import("expo-sensors");
    Accelerometer.setUpdateInterval(1000 / 30);
    sub = Accelerometer.addListener(({ x, y }) => {
      // 안드로이드 가속도계(g 단위)는 중력의 반대 방향을 잰다 — 세워 들면 y = +1.
      // 중력 = -가속도, 기기 좌표(오른쪽 +x, 위 +y) → 화면 좌표(아래 +y): (-x, +y).
      // 부드럽게(저역 통과) — 손떨림·센서 잡음에 물 방향이 출렁이지 않게.
      gravity = { dx: gravity.dx * 0.85 + -x * 0.15, dy: gravity.dy * 0.85 + y * 0.15 };
    });
  } catch { sub = null; }
}

/** 시뮬레이션이 읽는 중력 — 고정값이 있으면 그것. 폰을 거의 눕히면 '아래'로 고정하고 세기만 줄인다. */
export function simGravity(): Vec {
  const g = fakeGravity ?? gravity;
  const len = Math.hypot(g.dx, g.dy);
  if (len < 0.35) return { dx: 0, dy: Math.max(0.2, len) };
  return g;
}

/** 바람이 화면 가로로 미는 정도(-1…1). 서풍(270°에서 불어옴)이면 오른쪽(+). 10km/h 아래 무시, 45km/h 이상 최대. */
export function windPush(s: State = state): number {
  const v = s.previewWind ?? s.wind;
  if (v <= 10) return 0;
  const k = Math.min(1, (v - 10) / 35);
  const from = ((s.previewWind != null ? 270 : s.windDir) * Math.PI) / 180;
  return -Math.sin(from) * k;
}

// ── 무드(추천) ────────────────────────────────────────────────────
export function phase(now = Date.now(), s: State = state): "night" | "morning" | "golden" | "day" {
  const { sunrise: rise, sunset: setT } = s;
  if (rise != null && setT != null && setT > rise) {
    if (now < rise - 1800_000 || now > setT + 2400_000) return "night";
    if (now < rise + 2.5 * 3600_000) return "morning";
    if (now > setT - 5400_000) return "golden";
    return "day";
  }
  const h = new Date(now).getHours();
  return h < 6 || h >= 19 ? "night" : h < 10 ? "morning" : h >= 17 ? "golden" : "day";
}

/** 컨셉이 지금 무드에 얼마나 맞나(0 = 무관). 날씨가 더 중요하고, 비·눈 오는 날엔 실내 아늑한 컨셉도 어울린다. */
export function moodScore(m: Mood | undefined, now = Date.now(), s: State = state): number {
  if (!m) return 0;
  const c = current(s);
  const wx = c === "rain" || c === "storm" ? "rain" : c === "snow" ? "snow" : c === "clear" ? "sunny" : "cloudy";
  let sc = 0;
  if (m.wx === wx) sc += 3; else if ((wx === "rain" || wx === "snow") && m.wx === "indoor") sc += 1;
  if (m.tod === phase(now, s)) sc += 2;
  return sc;
}

// ── 광원(맑은 날 그림자) ──────────────────────────────────────────
export interface Light { dx: number; dy: number; radius: number; opacity: number; warm: number }

/** 해가 왼쪽(아침)에서 오른쪽(저녁)으로 — 그림자는 반대쪽으로 길게. 일출·일몰 근처일수록 길고 따뜻, 맑을수록 진함. */
export function light(now = Date.now(), s: State = state): Light {
  const base: Light = { dx: 0, dy: 3, radius: 6, opacity: 0.10, warm: 0 };
  if (!s.effectsOn) return base;
  const w = current(s);
  const clarity = w === "clear" ? 1 : w === "cloud" ? 0.55 : w === "fog" ? 0.35 : 0.3;
  const { sunrise: rise, sunset: setT } = s;
  if (rise == null || setT == null || setT <= rise || now <= rise || now >= setT) return base; // 밤 — 바로 아래 옅게
  const t = (now - rise) / (setT - rise);
  const elevation = Math.sin(Math.PI * t);
  const azimuth = Math.cos(Math.PI * t);
  const length = 4 + 10 * (1 - elevation);
  const golden = Math.max(0, 1 - elevation / 0.35);
  return {
    dx: azimuth * length, dy: 3 + 4 * elevation, radius: 5 + 5 * (1 - elevation),
    opacity: 0.08 + 0.20 * clarity, warm: golden * clarity,
  };
}
