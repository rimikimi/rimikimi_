// 생성 중 케이스 광고 카드(오너 2026-10-29) — 진행 카드 바로 아래. iOS PromoAdCard 와 같은 화면.
// "이미지가 생성되는 동안 케이스를 구경해보세요" + 30초 영상(무작위로 계속 이어 재생) + "케이스 보러가기".
// 영상이나 버튼을 누르면 지금 나오는 시리즈의 **갤럭시** 상품 페이지로 바로(Linking). 우측 상단 = 음소거(기억).
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import Svg, { Path } from "react-native-svg";
import { Text } from "./Text";
import { color, space, themedStyles } from "@/theme/tokens";
import { isKo } from "@/lib/locale";
import {
  loadPromoMuted, promoConfig, promoLink, promoPlaylist, promoText, promoUrl, savePromoMuted, type PromoAd,
} from "@/lib/promoAds";

export function PromoAdCard({ magicBooth }: { magicBooth: boolean }) {
  const listRef = useRef<PromoAd[]>(promoPlaylist(magicBooth));
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const first = listRef.current[0];
  const player = useVideoPlayer(first ? promoUrl(first.video.android) : null, (p) => {
    p.loop = false;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  useEffect(() => { void loadPromoMuted().then((m) => { setMuted(m); player.muted = m; }); }, [player]);

  // 끝나면 다음 광고, 목록 끝이면 처음으로.
  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      setIndex((i) => {
        const n = (i + 1) % listRef.current.length;
        const url = promoUrl(listRef.current[n]?.video.android);
        if (url) { player.replace(url); player.play(); }
        return n;
      });
    });
    return () => sub.remove();
  }, [player]);

  // 앱이 뒤로 가면 멈춤.
  useEffect(() => {
    const s = AppState.addEventListener("change", (st) => { if (st === "active") player.play(); else player.pause(); });
    return () => s.remove();
  }, [player]);

  const open = () => {
    const ad = listRef.current[index];
    if (!ad) return;
    const url = promoLink(ad, player.currentTime || 0);
    if (url) void Linking.openURL(url);
  };
  const toggleMute = () => { const m = !muted; setMuted(m); player.muted = m; void savePromoMuted(m); };
  const cfg = promoConfig();

  return (
    <View style={styles.wrap}>
      <Text size="title2" weight="bold" style={styles.headline}>
        {promoText(cfg?.headline, "이미지가 생성되는 동안\n케이스를 구경해보세요", "Browse our phone cases\nwhile your image is being created")}
      </Text>
      <View style={styles.videoBox}>
        <Pressable onPress={open} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={isKo ? "케이스 상품 보기" : "Open the case product"}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        </Pressable>
        <View style={styles.tag} pointerEvents="none"><Text size="footnote" weight="bold" style={styles.white}>rmkm</Text></View>
        <Pressable onPress={toggleMute} style={styles.mute} hitSlop={8} accessibilityRole="button" accessibilityLabel={muted ? (isKo ? "소리 켜기" : "Unmute") : (isKo ? "소리 끄기" : "Mute")}>
          <SpeakerIcon muted={muted} />
        </Pressable>
      </View>
      <Pressable onPress={open} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Text size="headline" weight="bold" style={styles.ctaText}>{promoText(cfg?.button, "케이스 보러가기", "Shop cases")}  ›</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s5, gap: space.s3 },
  headline: { color: color.ink },
  videoBox: { width: "72%", maxWidth: 280, aspectRatio: 9 / 16, alignSelf: "center", borderRadius: 18, overflow: "hidden", backgroundColor: "#222" },
  tag: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  white: { color: "#fff" },
  mute: { position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" },
  cta: { height: 52, borderRadius: 999, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  ctaText: { color: color.card },
}));

// 스피커 아이콘(직접 그림 — 아이콘 라이브러리 반입 금지 규칙).
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff" />
      {muted
        ? <Path d="M16 9l5 6M21 9l-5 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        : <Path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="#fff" strokeWidth={2} strokeLinecap="round" fill="none" />}
    </Svg>
  );
}
