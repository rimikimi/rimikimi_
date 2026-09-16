import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "@/lib/auth";
import { QuotaProvider } from "@/lib/quota";
import { StoreProvider } from "@/lib/store";
import { GenerationProvider } from "@/lib/generation";
import { LoginSheet } from "@/ui/LoginSheet";
import { Text } from "@/ui/Text";
import { envProblem } from "@/lib/env";
import { color, space } from "@/theme/tokens";
import { transitions } from "@/theme/motion";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
const BOOT_SPLASH_CAP_MS = 4000;

// ============================================================================
// Root stack. Stack policy (Justin 셸 그대로):
//   · 관련 없는 최상위 간 이동 = fade (방향은 정보가 아니다)
//   · 계층을 내려가는 이동(컨셉 → 옵션, 결과, 카테고리 더보기) = slide_from_right — 네이티브
//     스택은 시스템 기본 곡선(SPEC §1 "네이티브는 시스템 기본"), 길이만 푸시 400
//   · 시트(카메라·편집기 웹뷰) = modal
// ============================================================================

export default function RootLayout() {
  // 렌더 시점에 동기로 평가한다 — useEffect 에 두면 자식이 먼저 getEnv() 를 불러 죽는다.
  const [problem] = useState<string | null>(() => envProblem());

  useEffect(() => {
    const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => undefined); }, BOOT_SPLASH_CAP_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (problem) SplashScreen.hideAsync().catch(() => undefined);
  }, [problem]);

  if (problem) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: color.bg, padding: space.s5, justifyContent: "center" }}>
          <Text size="title2">앱 설정이 비어 있어요</Text>
          <Text size="footnote" tone="muted" style={{ marginTop: space.s2 }}>이 빌드에는 서버 주소나 키가 들어가지 않았어요. 이대로는 로그인도 생성도 되지 않아요.</Text>
          <Text size="caption" tone="subtle" style={{ marginTop: space.s4 }}>{problem}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <QuotaProvider>
            <StoreProvider>
              <GenerationProvider>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: color.bg },
                    animation: "fade",
                    animationDuration: transitions.routeSwap.duration,
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="guide" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="concept/[id]" options={{ animation: "slide_from_right", animationDuration: transitions.stepForward.duration }} />
                  <Stack.Screen name="result/[jobId]" options={{ animation: "slide_from_right", animationDuration: transitions.stepForward.duration }} />
                  <Stack.Screen name="category/[name]" options={{ animation: "slide_from_right", animationDuration: transitions.stepForward.duration }} />
                  <Stack.Screen name="camera" options={{ presentation: "modal", animationDuration: transitions.sheetIn.duration }} />
                  <Stack.Screen name="editor" options={{ presentation: "modal", animationDuration: transitions.sheetIn.duration }} />
                </Stack>
                {/* 로그인 시트 — 어느 화면에서든 requireLogin 이 띄운다. 스택 위에 그린다. */}
                <LoginSheet />
              </GenerationProvider>
            </StoreProvider>
          </QuotaProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
