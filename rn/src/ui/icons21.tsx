import React from "react";
import Svg, { Circle, Path, Rect, G } from "react-native-svg";
import type { IconProps } from "./icons";

// 2.1 추가 아이콘 — icons.tsx 와 같은 규칙(24×24, 2px 선, 둥근 끝, 채움 없음).

function Base({ size = 24, color = "currentColor", children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</G>
    </Svg>
  );
}

/** 설정(톱니) */
export const IconGear = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Base>
);
/** 말로 고치기(연필 + 줄) */
export const IconPencilLine = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 20h9" />
    <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Base>
);
/** 옛날 사진 복원(되감는 시계) */
export const IconClockBack = (p: IconProps) => (
  <Base {...p}>
    <Path d="M3 12a9 9 0 1 0 3-6.7" />
    <Path d="M3 4v5h5" />
    <Path d="M12 7v5l3 2" />
  </Base>
);
/** 세부 조정(슬라이더) */
export const IconSliders = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <Circle cx={16} cy={6} r={2} />
    <Circle cx={10} cy={12} r={2} />
    <Circle cx={18} cy={18} r={2} />
  </Base>
);
/** 필터(줄어드는 세 줄) */
export const IconFunnel = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4 6h16M7 12h10M10 18h4" />
  </Base>
);
/** 옷 바꾸기(티셔츠) */
export const IconShirt = (p: IconProps) => (
  <Base {...p}>
    <Path d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3a4 4 0 0 1-8 0Z" />
  </Base>
);
/** 신랑도 함께(하트 원) */
export const IconHeartCircle = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={12} r={9.5} />
    <Path d="M12 16.5s-4-2.4-4-5.2A2.2 2.2 0 0 1 12 10a2.2 2.2 0 0 1 4 1.3c0 2.8-4 5.2-4 5.2Z" />
  </Base>
);
/** 좌우반전 */
export const IconMirror = (p: IconProps) => (
  <Base {...p}>
    <Path d="M8 7 3 12l5 5M16 7l5 5-5 5M3 12h18" />
  </Base>
);
/** 폰카 묶음 표시 */
export const IconPhone = (p: IconProps) => (
  <Base {...p}>
    <Rect x={6} y={2.5} width={12} height={19} rx={2.5} />
    <Path d="M11 18.5h2" />
  </Base>
);
/** 아날로그(필름) 묶음 표시 */
export const IconFilm = (p: IconProps) => (
  <Base {...p}>
    <Rect x={3} y={3} width={18} height={18} rx={2} />
    <Path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
  </Base>
);
/** 즐겨찾기 묶음 표시(채운 별) */
export const IconStarFill = ({ size = 24, color = "currentColor" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 3.6 L14.6 9 L20.5 9.8 L16.2 14 L17.3 19.9 L12 17.1 L6.7 19.9 L7.8 14 L3.5 9.8 L9.4 9 Z" fill={color} />
  </Svg>
);
/** 노출(해) */
export const IconSun = ({ size = 24, color = "currentColor" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={4.5} fill={color} />
    <G stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </G>
  </Svg>
);
