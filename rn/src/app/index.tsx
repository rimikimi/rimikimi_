import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useAuth } from "@/lib/auth";
import { GUIDE_SEEN_KEY } from "@/lib/prefs";
import { getStartTab } from "@/lib/app21";
import { color } from "@/theme/tokens";

// 부트 게이트 — 세션 복구가 끝나면 목적지로 갈아탄 뒤 스플래시를 내린다.
//   첫 실행: 가이드 1장 → 홈 (팝업 0개, SPEC §3)
//   로그인 왕복 중 프로세스가 죽었다 살아난 경우: 남겨둔 화면으로 복귀

export default function Boot() {
  const { loading, takePendingRoute } = useAuth();
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      // 2.1(iOS 2026-10-09 C안): 예전 첫 실행 안내 화면은 없앴다 — 홈 튜토리얼(코치마크)이 대신한다.
      // 안내를 이미 본 사람과 같은 길로 보낸다(플래그만 남겨 둔다).
      await AsyncStorage.setItem(GUIDE_SEEN_KEY, "1").catch(() => undefined);
      const pending = await takePendingRoute();
      // 앱을 켜면 먼저 보일 화면(설정 · iOS `ui.startTab`) — 카메라·필터면 그 탭으로 연다.
      const start = await getStartTab();
      if (cancelled) return;
      router.replace(start === "camera" ? "/(tabs)/filter" : "/(tabs)/gallery");
      if (pending) setTimeout(() => router.push(pending as never), 50);
      setTimeout(() => { SplashScreen.hideAsync().catch(() => undefined); }, 80);
    })();
    return () => { cancelled = true; };
  }, [loading, takePendingRoute]);
  return <View style={{ flex: 1, backgroundColor: color.bg }} />;
}
