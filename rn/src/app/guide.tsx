import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/ui/Logo";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { copy } from "@/lib/copy";
import { color, space } from "@/theme/tokens";
import { GUIDE_SEEN_KEY } from "@/lib/prefs";

// 첫 실행 가이드 — 딱 1장. ATT 는 첫 생성 완료 후, 알림 권한은 "새 컨셉 알림 켜기" 를 누를 때(SPEC §3).
export default function Guide() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s7, paddingBottom: insets.bottom + space.s5 }]}>
      <View style={styles.body}>
        <Logo height={40} />
        <Text size="title2" center style={{ marginTop: space.s6 }}>{copy.guide.title}</Text>
        <Text size="body" tone="muted" center style={{ marginTop: space.s3 }}>{copy.guide.body}</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.s5 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.s4 },
});
