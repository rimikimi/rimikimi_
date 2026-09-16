import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useAuth } from "@/lib/auth";
import { GUIDE_SEEN_KEY } from "@/lib/prefs";
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
      const seen = await AsyncStorage.getItem(GUIDE_SEEN_KEY).catch(() => null);
      const pending = await takePendingRoute();
      if (cancelled) return;
      if (!seen) router.replace("/guide");
      else {
        router.replace("/(tabs)/gallery");
        if (pending) setTimeout(() => router.push(pending as never), 50);
      }
      setTimeout(() => { SplashScreen.hideAsync().catch(() => undefined); }, 80);
    })();
    return () => { cancelled = true; };
  }, [loading, takePendingRoute]);
  return <View style={{ flex: 1, backgroundColor: color.bg }} />;
}
