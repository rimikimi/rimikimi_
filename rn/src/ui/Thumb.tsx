import React from "react";
import { View } from "react-native";
import { Image, type ImageStyle } from "expo-image";
import { color, radius } from "@/theme/tokens";

/** 미리보기 비율 — **무조건 3:4**(오너 지시 2026-09-22). 정방형으로 자르면 인물이 잘린다. */
export const PHOTO_ASPECT = 3 / 4;

/** 폭에서 3:4 높이를 낸다. 반올림해 줄마다 1px 씩 어긋나지 않게. */
export function photoHeight(width: number): number {
  return Math.round(width / PHOTO_ASPECT);
}

/**
 * 사진 썸네일 — 3:4 고정 · 모서리 둥글게 · **첫 프레임부터 사진이 보인다.**
 *
 * ⚠️ `transition` 을 켜 두면 안 된다. 격자 열 수를 바꾸면 수십 칸이 **동시에** 새로 만들어지는데,
 *    칸마다 페이드가 걸리면 화면 전체가 허옇게 떴다가 돌아온다. iOS 에서 이것 때문에 하루를 잃었다
 *    (오너 지적 "재배열 되는 느낌이 아니라 refresh되는 느낌인데?"). 배치를 어떻게 바꾸든 —
 *    애니메이션·확대축소·크로스페이드 — 전부 이 깜빡임에 먹힌다. 원인은 배치가 아니라 로딩이다.
 *
 * ⚠️ `cachePolicy` 도 "disk" 면 안 된다. 메모리에 없으니 칸이 다시 만들어질 때마다 디스크를 다시
 *    읽고, 그동안 빈 바탕이 보인다. "memory-disk" 라야 즉시 뜬다.
 *
 * `recyclingKey` 는 칸을 재활용할 때 **다른 사진이 잠깐 비치는 것**을 막는다.
 */
export function Thumb({
  uri,
  width,
  height,
  rounded = radius.thumb,
  style,
}: {
  uri: string;
  width: number;
  height?: number;
  rounded?: number;
  style?: ImageStyle;
}) {
  const h = height ?? photoHeight(width);
  return (
    <Image
      source={{ uri }}
      style={[{ width, height: h, borderRadius: rounded, backgroundColor: color.mat }, style]}
      contentFit="cover"
      transition={0}
      cachePolicy="memory-disk"
      recyclingKey={uri}
    />
  );
}

/** 사진 위에 얹는 것들을 3:4 틀 안에 가두는 상자(별·"만든 컨셉" 표시 등). */
export function ThumbFrame({
  width,
  height,
  rounded = radius.thumb,
  children,
}: {
  width: number;
  height?: number;
  rounded?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ width, height: height ?? photoHeight(width), borderRadius: rounded, overflow: "hidden" }}>
      {children}
    </View>
  );
}
