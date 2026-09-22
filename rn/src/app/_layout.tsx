import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "@/lib/auth";
import { QuotaProvider } from "@/lib/quota";
import { StoreProvider } from "@/lib/store";
import { GenerationProvider } from "@/lib/generation";
import { CreditGateProvider } from "@/lib/creditGate";
import { installPushHandlers, setupNotifications } from "@/lib/push";
import { initAds } from "@/lib/ads";
import { usePushResultRouting } from "@/lib/pushRouting";
import { LoginSheet } from "@/ui/LoginSheet";
import { CreditSheet } from "@/ui/CreditSheet";
import { Text } from "@/ui/Text";
import { envProblem } from "@/lib/env";
import { applyScheme, color, space } from "@/theme/tokens";
import { transitions } from "@/theme/motion";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
const BOOT_SPLASH_CAP_MS = 4000;

// galleryId 룩업엔 useAuth/useGeneration 이 필요해 훅으로 분리했다 — Provider 트리 안에서만 쓸 수 있다.
function PushRouting() {
  usePushResultRouting();
  return null;
}

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
  // 다크 모드: 기기 설정을 그대로 따른다(app.config.ts userInterfaceStyle: "automatic").
  // useColorScheme 이 바뀌면 RootLayout 이 다시 렌더되고, applyScheme 이 `color` 값을 in-place
  // 로 바꾼 뒤 그 아래 전체 트리가(메모이제이션 없음) 새 값으로 다시 그려진다 — 화면마다
  // 하드코딩 없이 tokens.ts 하나로만 나간다.
  const osScheme = useColorScheme();
  applyScheme(osScheme);

  useEffect(() => {
    const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => undefined); }, BOOT_SPLASH_CAP_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (problem) SplashScreen.hideAsync().catch(() => undefined);
  }, [problem]);

  // 푸시: 배너·탭 라우팅 설치 + 이미 허용한 사람만 조용히 설정(ask=false). 권한 팝업은 프로필 토글에서만.
  useEffect(() => {
    if (problem) return;
    const off = installPushHandlers();
    void setupNotifications(false);
    return off;
  }, [problem]);

  // AdMob SDK 초기화만 미리(광고를 받아 두진 않는다 — 이유는 lib/ads.ts initAds 주석).
  // 전면광고를 띄우는 곳은 생성 성공 경로 한 곳뿐이다(lib/generation.tsx).
  useEffect(() => {
    if (problem) return;
    initAds();
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
              <CreditGateProvider>
              <GenerationProvider>
                <PushRouting />
                <StatusBar style="auto" />
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
                  <Stack.Screen name="store" options={{ animation: "slide_from_right", animationDuration: transitions.stepForward.duration }} />
                  <Stack.Screen name="camera" options={{ presentation: "modal", animationDuration: transitions.sheetIn.duration }} />
                  <Stack.Screen name="face-scan" options={{ presentation: "modal", animationDuration: transitions.sheetIn.duration }} />
                  <Stack.Screen name="editor" options={{ presentation: "modal", animationDuration: transitions.sheetIn.duration }} />
                  {/* dev 전용 화면 프리뷰 (scripts/previews.tsx) — 릴리스 번들에서는 라우트가 빈 화면 */}
                  <Stack.Screen name="dev/index" />
                  <Stack.Screen name="dev/[name]" options={{ animation: "slide_from_right" }} />
                </Stack>
                {/* 로그인 시트 · 크레딧 부족 시트 — 어느 화면에서든 띄운다. 스택 위에 그린다. */}
                <LoginSheet />
                <CreditSheet />
              </GenerationProvider>
              </CreditGateProvider>
            </StoreProvider>
          </QuotaProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
