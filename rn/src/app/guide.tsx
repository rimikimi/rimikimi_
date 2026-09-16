import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/ui/Logo";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { copy } from "@/lib/copy";
import { color, space, themedStyles } from "@/theme/tokens";
import { GUIDE_SEEN_KEY } from "@/lib/prefs";

// 첫 실행 가이드 — 딱 1장(1.x Guide.jsx intro "3단계면 끝나요" 문구 재사용). 실행 시 다른 팝업 없음.
// ATT 는 iOS 전용, 알림 권한은 프로필 "새 컨셉 알림 켜기" 에서만(SPEC §3).
export default function Guide() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s7, paddingBottom: insets.bottom + space.s5 }]}>
      <View style={styles.body}>
        <Logo height={40} />
        <Text size="title2" center style={{ marginTop: space.s6 }}>{copy.guide.title}</Text>
        <View style={styles.steps}>
          {copy.guide.steps.map((s, i) => (
            <View key={s.t} style={[styles.step, i < copy.guide.steps.length - 1 && styles.stepLine]}>
              <Text size="body" weight="semibold">{s.t}</Text>
              <Text size="footnote" tone="muted">{s.d}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button
        label={copy.guide.cta}
        full
        onPress={() => {
          void AsyncStorage.setItem(GUIDE_SEEN_KEY, "1").catch(() => undefined);
          router.replace("/(tabs)/gallery");
        }}
      />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.s5 },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  steps: { alignSelf: "stretch", marginTop: space.s5 },
  step: { paddingVertical: space.s3, gap: 2 },
  stepLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
}));
