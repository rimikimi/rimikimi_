// Design tokens — SPEC.md §1 을 그대로 옮긴 것. 네이티브에는 CSS 캐스케이드가 없으므로
// 여기 살고, 이 파일 밖에서는 raw hex / raw fontSize 를 쓰지 않는다(Justin 셸의 규칙).
//
// 4주차: 기기 다크 모드를 따라간다(app.config.ts `userInterfaceStyle: "automatic"`). `color` 는
// 값이 바뀌는 하나의 객체 참조를 유지하고(재할당이 아니라 in-place 로 값만 바뀐다),
// `applyScheme()` 이 루트에서 시스템 테마가 바뀔 때마다 그 값을 라이트/다크로 맞바꾼다.
// 화면 파일들은 `themedStyles()` 로 감싼 스타일 팩토리를 쓰면 테마가 바뀔 때 자동으로
// 다시 계산된다 — 그 밖에서는 raw hex 금지 그대로.

export interface ColorTokens {
  bg: string;
  card: string;
  fill: string;
  fillPress: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  accent: string;
  accentWeak: string;
  accentOn: string;
  hearts: readonly [string, string, string, string];
  mat: string;
  scrim: string;
  danger: string;
  cameraBg: string;
  /** Glass 의 불투명 폴백(Android<31·감축투명도) — bg 와 같은 톤의 거의 불투명한 값. */
  glassFallback: string;
}

const LIGHT: ColorTokens = {
  // 바탕 #FBF8F3
  bg: "#FBF8F3",
  // 카드·행 #FFFFFF
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
  // 하트 4색 — 카테고리 칩 활성에만(테마 무관, SPEC 에 다크 변형 없음)
  hearts: ["#E6403C", "#F9C83C", "#60C9DE", "#8A5DA7"],
  // 이미지 매트(썸네일 로딩 중 바탕). 채움색과 같은 톤.
  mat: "#F1ECE4",
  // 시트 스크림
  scrim: "#000000",
  // 상태(오류 문구·삭제) — 강조색과 같이 쓴다(SPEC 에 별도 오류색 없음)
  danger: "#E6403C",
  // 카메라 버튼 바탕 = 잉크(오너 지시: "ink background")
  cameraBg: "#231F20",
  glassFallback: "rgba(251,248,243,0.96)",
};

const DARK: ColorTokens = {
  // 바탕 #17161A
  bg: "#17161A",
  // 카드·행 #201E23
  card: "#201E23",
  // 회색 채움 / 눌림 — 다크 카드보다 한 단 밝게
  fill: "#2A282E",
  fillPress: "#35323A",
  // 글자 — 흰 바탕 잉크를 뒤집는다. 2차 60%, 3차 30% 는 그대로 유지.
  ink: "#F4F2EE",
  ink2: "rgba(244,242,238,0.60)",
  ink3: "rgba(244,242,238,0.30)",
  // 구분선
  line: "rgba(244,242,238,0.14)",
  // 강조는 테마 무관(브랜드 색)
  accent: "#E6403C",
  accentWeak: "rgba(230,64,60,0.20)",
  accentOn: "#FFFFFF",
  hearts: ["#E6403C", "#F9C83C", "#60C9DE", "#8A5DA7"],
  // 이미지 매트 — 다크 채움과 같은 톤
  mat: "#2A282E",
  scrim: "#000000",
  danger: "#E6403C",
  // 카메라 버튼 바탕 — 다크에서도 잉크(어두운 배경 위 카메라 원은 그대로 검정 계열)
  cameraBg: "#0E0D10",
  glassFallback: "rgba(23,22,26,0.92)",
};

/** 다른 파일에서 직접 재할당하지 않는다 — `applyScheme()` 만 값을 바꾼다. */
export const color: ColorTokens = { ...LIGHT };

let scheme: "light" | "dark" = "light";
let version = 0;

/** 현재 활성 스킴. themedStyles 캐시 무효화용. */
export function schemeVersion(): number { return version; }

/** 루트(_layout.tsx)가 `useColorScheme()` 값이 바뀔 때마다 부른다. 같은 스킴이면 아무것도 안 한다. */
export function applyScheme(next: string | null | undefined): void {
  const s = next === "dark" ? "dark" : "light";
  if (s === scheme) return;
  scheme = s;
  Object.assign(color, s === "dark" ? DARK : LIGHT);
  version++;
}

export function currentScheme(): "light" | "dark" { return scheme; }

/**
 * `StyleSheet.create({...})` 를 감싸 테마가 바뀔 때만 다시 계산한다(그 사이는 캐시).
 * 컴포넌트 파일들은 그대로 `const styles = themedStyles(() => StyleSheet.create({...}))` 로만
 * 바꾸면 된다 — `color.*` 를 쓰는 스타일 값이 스킴 전환 때 새로 뽑힌다.
 */
export function themedStyles<T extends object>(factory: () => T): T {
  let cachedVersion = -1;
  let cached: T;
  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      if (cachedVersion !== version) {
        cached = factory();
        cachedVersion = version;
      }
      return (cached as Record<string | symbol, unknown>)[prop];
    },
  });
}

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

// 그림자는 항상 검정 — 라이트/다크 모두 뜬 크롬 아래 어두운 그늘이면 된다(테마별로 안 바뀐다).
export const shadow = {
  // 탭바·카메라 원처럼 실제로 떠 있는 크롬에만.
  float: {
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  camera: {
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
