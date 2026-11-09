import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { setFakeGravity, setPreview, type Weather } from "@/lib/ambient";
import { rainWorld } from "@/lib/rainWorld";

// dev 전용 — 홈 날씨 미리보기(iOS DevRoutes "/weather"). 에뮬레이터엔 기울기 센서 값이 없다시피 해서 고정할 수 있게.
//   com.rimikimi.app://dev/weather?set=rain|storm|snow|clear|cloud|auto&gx=0.4&gy=0.9&wind=30&bolt=5
export default function DevWeather() {
  const q = useLocalSearchParams<{ set?: string; gx?: string; gy?: string; wind?: string; bolt?: string }>();
  useEffect(() => {
    if (__DEV__) {
      const w = q.set === "auto" || !q.set ? null : (q.set as Weather);
      setPreview(w, q.wind ? Number(q.wind) : null);
      setFakeGravity(q.gx && q.gy ? { dx: Number(q.gx), dy: Number(q.gy) } : null);
      rainWorld.devBoltEvery = q.bolt ? Number(q.bolt) : null;
    }
    router.replace("/(tabs)/gallery");
  }, [q.set, q.gx, q.gy, q.wind, q.bolt]);
  return null;
}
