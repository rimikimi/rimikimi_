import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { Spinner } from "./Spinner";
import { IconClose } from "./icons";
import { useAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { color, chrome, space } from "@/theme/tokens";

// 1단계(2.0, SPEC §5): 편집기·카메라는 현재 웹(src/PhotoEditor.jsx · CameraStudio.jsx)을 웹뷰로 임베드.
// 저장·공유·앨범만 네이티브 브리지 — 2주차. 지금은 세션 토큰을 URL 해시로 넘겨 웹이 로그인 상태로 뜨게 한다.

export function WebTool({ title, tool, query }: { title: string; tool: "filter" | "camera"; query?: Record<string, string> }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const params = new URLSearchParams({ tool, native: "1", ...(query ?? {}) });
  const hash = session ? `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}` : "";
  const uri = `${getEnv().apiBase}/?${params.toString()}${hash}`;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.side} />
        <Text size="headline">{title}</Text>
        <View style={[styles.side, { alignItems: "flex-end" }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12} onPress={() => router.back()}>
            <IconClose size={24} color={color.ink} />
          </Pressable>
        </View>
      </View>
      <WebView
        source={{ uri }}
        style={styles.web}
        onLoadEnd={() => setLoading(false)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        originWhitelist={["https://*"]}
      />
      {loading ? <View style={styles.loading} pointerEvents="none"><Spinner size={28} color={color.accent} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  bar: { height: chrome.headerH, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.screen, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  side: { width: 40 },
  web: { flex: 1, backgroundColor: color.bg },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
