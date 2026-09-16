import { Easing } from "react-native-reanimated";

type Curve = ReturnType<typeof Easing.bezier>;

// ============================================================================
// MOTION — Justin 셸의 모션 표를 그대로 옮긴 것(SPEC §1 전환 행과 값이 같다).
//   · 푸시 400 · 팝 360 · 곡선 (0.32,0.72,0,1) — 네이티브 스택은 시스템 기본
//   · 진입/종료 260 / 160 (종료가 진입보다 빠르다)
//   · 시트 열림 320 · 닫힘 220 · 드래그 1:1 · 45% 넘게 끌거나 빠르면 닫힘
//   · 누름 scale 0.97 (전체폭 바 0.985) · 110ms in / 140ms out
//   · 탭 전환 0ms · 애니메이션은 transform/opacity 만
// 감축 모션: Reanimated 는 `reduceMotion` 미지정 시 OS 설정을 따라 애니메이션을 건너뛴다.
//   · opacity-only(FadeIn/FadeOut) → `.reduceMotion(ReduceMotion.Never)` — 항상 재생
//   · transform 이 실린 것(Slide, press scale) → 지정 없음(=System) — 감축 시 제거
// ============================================================================

export const ease: Record<string, Curve> = {
  /** entering / responding — the default UI curve */
  out: Easing.bezier(0.23, 1, 0.32, 1),
  /** A→B inside one screen */
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  /** sheets and drawers (iOS family) — SPEC 전환 곡선 (0.32,0.72,0,1) */
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
  /** utility, hover, short fades (M3 standard) */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** route enter (M3 emphasized decelerate) */
  decel: Easing.bezier(0.05, 0.7, 0.1, 1),
};

export const duration = {
  press: 110,
  pressRelease: 140,
  pop: 150,
  swap: 120,
  exit: 160,
  enter: 260,
  panel: 240,
  sheet: 320,
  sheetOut: 220,
  reveal: 280,
  stagger: 60,
  push: 400,
  popRoute: 360,
} as const;

export const PRESS_SCALE = 0.97;
/** A full-width bar button at 0.97 moves its edge ~5px, which reads as a wobble. */
export const PRESS_SCALE_WIDE = 0.985;
export const CARD_PRESS_SCALE = 0.985;

/**
 * The transition table, as code. Each entry is referenced by name from the screen
 * that uses it so a reviewer can check the spec against the implementation.
 */
export const transitions = {
  /** #1 route change between unrelated tops → fade-through. Direction carries no meaning. */
  routeSwap: { easing: ease.decel, duration: 200, exitDuration: 120, props: "opacity" },
  /** #3/#4 step forward/back inside a hierarchy. Direction is the information. */
  stepForward: { easing: ease.out, duration: duration.push, exitDuration: duration.popRoute, dx: 20 },
  stepBack: { easing: ease.out, duration: duration.popRoute, exitDuration: 140, dx: -20 },
  /** #5 canvas image swap. No scale, no blur — never distort a photo. */
  canvasSwap: { easing: ease.standard, duration: 160, props: "opacity" },
  /** #7 bottom sheet. Interruptible: 1:1 drag, velocity > 0.11 px/ms or > 45% closes. */
  sheetIn: { easing: ease.drawer, duration: duration.sheet },
  sheetOut: { easing: ease.drawer, duration: duration.sheetOut },
  /** #11 button press — starts on pressIn, never on release. */
  press: { easing: ease.out, duration: duration.press, releaseDuration: duration.pressRelease },
  /** #18 thumbnails fill in as bytes decode. Independent per card, 60ms stagger, capped at 6. */
  variantFill: { easing: ease.out, duration: 260, stagger: duration.stagger, staggerMax: 6 },
  /** #23 list rows enter. Stagger stops after the 6th row so long lists are not slow. */
  findingsIn: { easing: ease.out, duration: 220, stagger: 40, staggerMax: 6 },
  /** #26 credit chip counts down — the receipt for passing the gate. */
  creditChange: { easing: ease.out, duration: 180, exitDuration: 110 },
  /** #28 세그먼티드 컨트롤. 알약이 미끄러진다 — 스프링(연타 시 현재 위치에서 재조준). */
  segmentSlide: { damping: 26, stiffness: 320, mass: 0.9 },
  /** #29 조건부 입력란이 나타난다. 들어올 땐 여유 있게, 나갈 땐 빠르게 — 비대칭. */
  fieldReveal: { easing: ease.out, duration: 220, exitDuration: 140, dy: 8 },
  /** #30 목록이 통째로 바뀐다(카테고리 칩). 교차 페이드 — 방향은 정보가 아니다. */
  listSwap: { easing: ease.standard, duration: 180, exitDuration: 110, props: "opacity" },
  /** 진행 카드가 결과로 바뀐다 — 진입 260 / 종료 160. */
  cardSettle: { easing: ease.out, duration: duration.enter, exitDuration: duration.exit },
} as const;

/** 절대 애니메이션하지 않는 것. */
export const NO_ANIMATION = [
  "tab active swap (0ms)",
  "focus ring (0ms — never delay an accessibility signal)",
  "category chip active colour (0ms — the list under it cross-fades instead)",
  "result zoom/pan (1:1 with the finger)",
] as const;
