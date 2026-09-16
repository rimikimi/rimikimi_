import React from "react";
import Svg, { Circle, Path, Rect, G } from "react-native-svg";

// ICONS — self-drawn on a 24×24 grid (Justin 규칙: 아이콘 라이브러리 반입 금지).
// 2px stroke, round cap/join, no fill. The caller decides the colour.

export type IconSize = 16 | 20 | 24 | 28 | 32;

export interface IconProps {
  size?: IconSize;
  color?: string;
}

function Base({ size = 24, color = "currentColor", children, rotate }: IconProps & { children: React.ReactNode; rotate?: number }) {
  // 회전은 `origin`/`rotation` 축약 prop 대신 표준 SVG `transform` 문자열로 준다 — 둘 다
  // react-native-svg 가 같은 행렬로 계산해 동작은 같지만, `origin` 축약형은 웹 전용 내부 구현이
  // 별도로 `transform-origin`(대시 포함 DOM 속성)을 만들어 react-native-web 에서만
  // "Invalid DOM property `transform-origin`" 콘솔 경고를 낸다(node_modules/react-native-svg/
  // lib/commonjs/web/utils/prepare.js). 네이티브(안드로이드/iOS)엔 이 파일 자체가 없어 원래도
  // 영향이 없었다 — 이건 순수 웹 프리뷰 콘솔 노이즈였고, 표준 transform 문자열로 바꿔 아예 없앤다.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" transform={`rotate(${rotate ?? 0} 12 12)`}>
        {children}
      </G>
    </Svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Base {...p}><Path d="M5.5 12.5 L10 17 L18.5 7.5" /></Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}><Path d="M6 6 L18 18" /><Path d="M18 6 L6 18" /></Base>
);

export const IconChevron = (p: IconProps & { dir?: "right" | "down" | "left" | "up" }) => {
  const map = { right: 0, down: 90, left: 180, up: 270 } as const;
  return <Base {...p} rotate={map[p.dir ?? "right"]}><Path d="M9.5 5.5 L15.5 12 L9.5 18.5" /></Base>;
};

export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}><Path d="M5.5 12 L18.5 12" /><Path d="M11 6.5 L5.5 12 L11 17.5" /></Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}><Path d="M12 5.5 L12 18.5" /><Path d="M5.5 12 L18.5 12" /></Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <Path d="M5 15.5 L5 18.5 L19 18.5 L19 15.5" />
    <Path d="M12 4 L12 14.5" />
    <Path d="M7.5 10 L12 14.5 L16.5 10" />
  </Base>
);

export const IconShare = (p: IconProps) => (
  <Base {...p}>
    <Path d="M5 12.5 L5 18.5 L19 18.5 L19 12.5" />
    <Path d="M12 15 L12 4" />
    <Path d="M8 8 L12 4 L16 8" />
  </Base>
);

export const IconImage = (p: IconProps) => (
  <Base {...p}>
    <Rect x={4} y={5} width={16} height={14} rx={3} />
    <Circle cx={9} cy={10} r={1.6} />
    <Path d="M5 17.5 L10 12 L13.5 15 L16 12.5 L20 16.5" />
  </Base>
);

/** 갤러리 탭 — 그림 두 장이 겹친 모양 */
export const IconGallery = (p: IconProps) => (
  <Base {...p}>
    <Rect x={3.5} y={7} width={14} height={12} rx={2.5} />
    <Path d="M7.5 7 V5.5 a1.5 1.5 0 0 1 1.5 -1.5 H19 a1.5 1.5 0 0 1 1.5 1.5 V14 a1.5 1.5 0 0 1 -1.5 1.5 H17.5" />
    <Path d="M4.5 17 L8.5 12.5 L11.5 15.5 L13.5 13.5 L17 17" />
  </Base>
);

/** 필터 탭 — 원 셋이 겹친 렌즈 모양 */
export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={9} r={4.5} />
    <Circle cx={8.5} cy={14.5} r={4.5} />
    <Circle cx={15.5} cy={14.5} r={4.5} />
  </Base>
);

export const IconCamera = (p: IconProps) => (
  <Base {...p}>
    <Path d="M9 7.5 L10.2 5 L13.8 5 L15 7.5" />
    <Rect x={3.5} y={7.5} width={17} height={12} rx={3} />
    <Circle cx={12} cy={13.5} r={3.6} />
  </Base>
);

export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <Rect x={5} y={5} width={6.4} height={6.4} rx={1.6} />
    <Rect x={12.6} y={5} width={6.4} height={6.4} rx={1.6} />
    <Rect x={5} y={12.6} width={6.4} height={6.4} rx={1.6} />
    <Rect x={12.6} y={12.6} width={6.4} height={6.4} rx={1.6} />
  </Base>
);

export const IconUser = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={8.6} r={3.4} />
    <Path d="M5 19.5 C6.8 15.4 9.2 13.6 12 13.6 C14.8 13.6 17.2 15.4 19 19.5" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <Path d="M18 8.2 A6 6 0 1 0 18.9 13.6" />
    <Path d="M18.2 4.6 L18.2 8.6 L14.2 8.6" />
  </Base>
);

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4.5 7 L19.5 7" />
    <Path d="M9.5 7 L9.5 5 L14.5 5 L14.5 7" />
    <Path d="M6.5 7 L7.4 19.5 L16.6 19.5 L17.5 7" />
  </Base>
);

export const IconSparkle = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 3.5 L13.8 9.2 L19.5 11 L13.8 12.8 L12 18.5 L10.2 12.8 L4.5 11 L10.2 9.2 Z" />
    <Path d="M18.5 17 L19 18.5 L20.5 19 L19 19.5 L18.5 21 L18 19.5 L16.5 19 L18 18.5 Z" />
  </Base>
);

export const IconWand = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4.5 19.5 L14.5 9.5" />
    <Path d="M13 8 L16 11" />
    <Path d="M17.5 3.5 L18 5.5 L20 6 L18 6.5 L17.5 8.5 L17 6.5 L15 6 L17 5.5 Z" />
  </Base>
);

/** credit — 하트 하나. 워드마크의 하트와 같은 모양(단순화). */
export const IconHeart = ({ size = 24, color = "currentColor", filled }: IconProps & { filled?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 20.5 C7.5 17.2 3.5 13.9 3.5 9.3 C3.5 6.6 5.5 4.5 8 4.5 C9.7 4.5 11.1 5.4 12 6.8 C12.9 5.4 14.3 4.5 16 4.5 C18.5 4.5 20.5 6.6 20.5 9.3 C20.5 13.9 16.5 17.2 12 20.5 Z"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
      fill={filled ? color : "none"}
    />
  </Svg>
);

/** Not a glyph — a 25% arc that the Spinner rotates. */
export const IconSpinnerArc = ({ size = 20, color = "currentColor" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} opacity={0.22} />
    <Path d="M12 3 A9 9 0 0 1 21 12" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
  </Svg>
);
