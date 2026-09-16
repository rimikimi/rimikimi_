// Design tokens — SPEC.md §1 을 그대로 옮긴 것. 네이티브에는 CSS 캐스케이드가 없으므로
// 여기 살고, 이 파일 밖에서는 raw hex / raw fontSize 를 쓰지 않는다(Justin 셸의 규칙).
//
// 2.0 은 라이트 전용으로 출시한다(app.config.ts `userInterfaceStyle: "light"`). 다크 값은
// SPEC 에 적힌 대로 주석으로 남겨 두고, 다크 모드가 열리면 여기서만 바꾼다.

export const color = {
  // 바탕 #FBF8F3 (다크 #17161A)
  bg: "#FBF8F3",
  // 카드·행 #FFFFFF (다크 #201E23)
  card: "#FFFFFF",
  // 회색 채움(2차 버튼·칩) / 눌림
  fill: "#F1ECE4",
  fillPress: "#E4DCD0",
  // 글자 — 2차 60%, 3차 30%
  ink: "#231F20",
  ink2: "rgba(35,31,32,0.60)",
  ink3: "rgba(35,31,32,0.30)",
  // 구분선
  line: "rgba(35,31,32,0.14)",
  // 강조(탭 활성·주 버튼) + 연하게
  accent: "#E6403C",
  accentWeak: "rgba(230,64,60,0.12)",
  accentOn: "#FFFFFF",
  // 하트 4색 — 카테고리 칩 활성에만
  hearts: ["#E6403C", "#F9C83C", "#60C9DE", "#8A5DA7"] as const,
  // 이미지 매트(썸네일 로딩 중 바탕). 채움색과 같은 톤.
  mat: "#F1ECE4",
  // 시트 스크림
  scrim: "#000000",
  // 상태(오류 문구·삭제) — 강조색과 같이 쓴다(SPEC 에 별도 오류색 없음)
  danger: "#E6403C",
  // 카메라 버튼 바탕 = 잉크(오너 지시: "ink background")
  cameraBg: "#231F20",
} as const;

// 모서리: 버튼 12 · 카드 14 · 시트 20 · 칩 999
export const radius = {
  btn: 12,
  card: 14,
  sheet: 20,
  pill: 999,
  thumb: 10,
} as const;

// 여백: 화면 16
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
  screen: 16,
} as const;

// 타입: Title2 22/700 · Headline 17/600 · Body 17 · Callout 15 · Footnote 13/500 · Caption 11/600
// size + lineHeight 는 한 세트로만 움직인다.
export const type = {
  title2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.26 },
  headline: { fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  callout: { fontSize: 15, lineHeight: 20, letterSpacing: -0.23 },
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: -0.08 },
  caption: { fontSize: 11, lineHeight: 13, letterSpacing: 0.06 },
} as const;

/** SPEC 이 정한 롤별 기본 굵기 — Text 가 size 만 받았을 때 이 굵기를 쓴다. */
export const roleWeight: Record<keyof typeof type, keyof typeof weight> = {
  title2: "bold",
  headline: "semibold",
  body: "regular",
  callout: "regular",
  footnote: "medium",
  caption: "semibold",
};

// 글꼴: 시스템 전용(Roboto / Noto Sans KR). 전부 undefined → RN 이 fontFamily 를 안 잡는다.
export const font = {
  regular: undefined,
  medium: undefined,
  semibold: undefined,
  bold: undefined,
} as const;

export const weight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// 버튼 높이 50 (작은 것 36) · 탭바 높이 62 · 하단 14 · 좌우 12 · 카메라 원 54(위로 14)
export const chrome = {
  buttonH: 50,
  buttonSmH: 36,
  headerH: 52,
  tabBarH: 62,
  tabBarBottom: 14,
  tabBarSide: 12,
  cameraD: 54,
  cameraLift: 14,
} as const;

export const shadow = {
  // 탭바·카메라 원처럼 실제로 떠 있는 크롬에만.
  float: {
    shadowColor: color.ink,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  camera: {
    shadowColor: color.ink,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
