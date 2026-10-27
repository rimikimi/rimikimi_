import React, { forwardRef, useImperativeHandle, useRef } from "react";
import type { NativeSyntheticEvent, ViewStyle } from "react-native";
import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import { buildLuts, presetByKey } from "@/filters";

// ============================================================================
// 카메라·필터 탭 뷰파인더 — 로컬 네이티브 모듈 `modules/live-camera`(CameraX + GLES 셰이더).
// 필터 값은 여기서(웹 filters.js 를 옮긴 `filters.ts`) 계산해 넘긴다: 채널 LUT 3×256 + 채도·HSL
// 대역·스플릿톤·특수 모드·효과. 셰이더는 그 값으로 매 프레임 그린다.
// ============================================================================

export interface LiveReady { minZoom: number; maxZoom: number; lensStops: number[]; evMin: number; evMax: number; front: boolean }
export interface CaptureResult { uri: string; width: number; height: number }

export interface LiveCameraHandle {
  capture(): Promise<CaptureResult>;
  /**
   * 찍은 사진(capture 의 uri)에 미리보기와 같은 필터를 입힌 새 JPEG — 사진첩 저장본용(iOS 와 같이 보던 그대로).
   * presetKey·fxAmount = 셔터 순간 값. 원본 uri 는 그대로 남는다(편집기용). 실패하면 reject → 원본으로 대신한다.
   */
  renderStill(uri: string, presetKey: string, fxAmount: number): Promise<CaptureResult>;
  focus(x: number, y: number, lock: boolean): Promise<void>;
  setExposure(ev: number): Promise<void>;
  setZoom(z: number): Promise<void>;
}

export interface LookProps {
  preset: number; special: number; lut: number[];
  bwOn: number; bw: number[]; sat: number; vib: number; sh: number[]; hi: number[];
  hsl: number[][]; c1: number[]; c2: number[]; grain: number; vignette: number; leak: number;
}

interface NativeProps {
  style?: ViewStyle;
  active: boolean;
  facing: "back" | "front";
  mirror: boolean;
  flash: boolean;
  intensity: number;
  look: LookProps;
  onReady?: (e: NativeSyntheticEvent<LiveReady>) => void;
  onCameraError?: (e: NativeSyntheticEvent<{ message: string }>) => void;
  /** 앞뒤 전환 뒤 새 카메라의 첫 프레임 — 덮개를 이때 걷는다(안드로이드, 117+). */
  onFirstFrame?: (e: NativeSyntheticEvent<{ front: boolean }>) => void;
}

/** 네이티브 뷰가 실제로 내놓는 함수 — renderStill 은 look 맵을 받는다(presetKey → look 변환은 JS lookFor). */
interface NativeHandle {
  capture(): Promise<CaptureResult>;
  renderStill(uri: string, look: LookProps, intensity: number): Promise<CaptureResult>;
  focus(x: number, y: number, lock: boolean): Promise<void>;
  setExposure(ev: number): Promise<void>;
  setZoom(z: number): Promise<void>;
}
const Native = requireNativeViewManager<NativeProps & { ref?: React.Ref<NativeHandle> }>("LiveCamera");

const SPECIAL: Record<string, number> = { duotone: 1, thermal: 2, glitch: 3, vhs: 4, pixelate: 5, sketch: 6, beauty: 7 };

const Mod = requireNativeModule<{ detectFaces(uri: string): Promise<number[][]> }>("LiveCamera");
/**
 * 인플 — 저장된 사진에서 얼굴 사각형(정규화 [x,y,w,h], 위가 0). 편집기 payload `faces` 로 넘겨
 * 저장본(웹 filters.js)이 미리보기와 같은 얼굴 영역을 쓰게 한다(iOS AppState.handlePickedPhotos 와 같다).
 */
export async function detectFaces(uri: string): Promise<number[][]> {
  try { return await Mod.detectFaces(uri); } catch { return []; }
}

const lookCache = new Map<string, LookProps>();
/** 서버 필터 카탈로그가 값을 바꾸면 비운다(같은 키라도 새 값으로). */
export function clearLookCache() { lookCache.clear(); }
/** 프리셋 키 → 셰이더 값. "none"·모르는 키 = 원본 그대로. */
export function lookFor(key: string): LookProps {
  const hit = lookCache.get(key);
  if (hit) return hit;
  const p = presetByKey(key);
  const none = !p || p.key === "none";
  const luts = none ? null : buildLuts(p);
  const look: LookProps = {
    preset: none ? 0 : 1,
    special: p?.special ? SPECIAL[p.special] ?? 0 : 0,
    lut: luts ? [...luts[0], ...luts[1], ...luts[2]] : [],
    bwOn: p?.bw ? 1 : 0,
    bw: p?.bw ?? [0.299, 0.587, 0.114],
    sat: p?.sat ?? 0,
    vib: p?.vib ?? 0,
    sh: p?.sh ?? [0, 0, 0],
    hi: p?.hi ?? [0, 0, 0],
    hsl: (p?.hsl ?? []).slice(0, 4).map((b) => [b.c, b.w, b.h ?? 0, b.s ?? 0, b.l ?? 0]),
    c1: p?.c1 ?? [0, 0, 0],
    c2: p?.c2 ?? [255, 255, 255],
    grain: p?.fx?.grain ?? 0,
    vignette: p?.fx?.vignette ?? 0,
    leak: p?.fx?.leak ?? 0,
  };
  lookCache.set(key, look);
  return look;
}

export const LiveCameraView = forwardRef<LiveCameraHandle, Omit<NativeProps, "look"> & { presetKey: string }>(
  function LiveCameraView({ presetKey, ...rest }, ref) {
    const inner = useRef<NativeHandle>(null);
    const need = () => { const n = inner.current; if (!n) throw new Error("LiveCamera not mounted"); return n; };
    useImperativeHandle(ref, () => ({
      capture: () => need().capture(),
      renderStill: (uri, key, fx) => need().renderStill(uri, lookFor(key), fx),
      focus: (x, y, lock) => need().focus(x, y, lock),
      setExposure: (ev) => need().setExposure(ev),
      setZoom: (z) => need().setZoom(z),
    }), []);
    return <Native ref={inner} look={lookFor(presetKey)} {...rest} />;
  },
);
