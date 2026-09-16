import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Logo } from "./Logo";
import { Spinner } from "./Spinner";
import { useAuth, type Provider } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { chrome, color, radius, space } from "@/theme/tokens";

// 로그인 시트 — Apple · 카카오 · 네이버 · Google. 시점은 만들기/필터/카메라 뿐(SPEC §3).
// 브랜드 버튼 색은 각 제공자 가이드의 고정값이라 토큰이 아니다(웹 LoginGate.jsx 와 같은 값).

const BRAND = {
  apple: { bg: "#000000", fg: "#FFFFFF" },
  kakao: { bg: "#FEE500", fg: "#191919" },
  naver: { bg: "#03C75A", fg: "#FFFFFF" },
  google: { bg: "#FFFFFF", fg: color.ink },
} as const;

function ProviderIcon({ p, colorFg }: { p: Provider; colorFg: string }) {
  if (p === "apple") return <Svg width={16} height={18} viewBox="0 0 24 24"><Path fill={colorFg} d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12 7.25C11.85 5 13.69 3.12 15.79 3c.29 2.58-2.34 4.5-3.79 4.25" /></Svg>;
  if (p === "kakao") return <Svg width={18} height={18} viewBox="0 0 24 24"><Path fill={colorFg} d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.86 5.31 4.66 6.74-.2.71-.73 2.62-.84 3.03-.13.5.18.49.39.36.16-.1 2.51-1.7 3.52-2.39.74.11 1.5.17 2.27.17 5.52 0 10-3.58 10-8s-4.48-7.91-10-7.91z" /></Svg>;
  if (p === "naver") return <Svg width={14} height={14} viewBox="0 0 24 24"><Path fill={colorFg} d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727z" /></Svg>;
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const ORDER: { p: Provider; label: string }[] = [
  { p: "apple", label: copy.login.apple },
  { p: "kakao", label: copy.login.kakao },
  { p: "naver", label: copy.login.naver },
  { p: "google", label: copy.login.google },
];

export function LoginSheet() {
  const { sheetOpen, sheetReason, busy, error, closeSheet, signIn } = useAuth();
  const reason = sheetReason === "filter" ? copy.login.reasonFilter : sheetReason === "camera" ? copy.login.reasonCamera : copy.login.reasonMake;
  return (
    <Sheet open={sheetOpen} onClose={closeSheet}>
      <View style={styles.logo}><Logo height={30} /></View>
      <Text size="callout" tone="muted" center>{sheetReason ? reason : copy.login.tagline}</Text>
      <View style={styles.buttons}>
        {ORDER.map(({ p, label }) => {
          const b = BRAND[p];
          const isBusy = busy === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              disabled={!!busy}
              onPress={() => { void signIn(p); }}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: b.bg, opacity: busy && !isBusy ? 0.5 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
                p === "google" && styles.googleBorder,
              ]}
            >
              <View style={styles.slot}>{isBusy ? <Spinner size={18} color={b.fg} /> : <ProviderIcon p={p} colorFg={b.fg} />}</View>
              <Text size="callout" weight="bold" style={{ color: b.fg }}>{isBusy ? copy.login.loading : label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text size="footnote" tone="danger" center>{error}</Text> : null}
      <Text size="caption" tone="subtle" center weight="medium">{copy.login.terms}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: "center", marginTop: space.s2 },
  buttons: { gap: space.s3, marginTop: space.s2 },
  btn: { height: chrome.buttonH, borderRadius: radius.btn, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s2 },
  googleBorder: { borderWidth: 1.5, borderColor: color.line },
  slot: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
});
