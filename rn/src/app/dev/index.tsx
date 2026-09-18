import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { IconChevron } from "@/ui/icons";
import { color, space, themedStyles } from "@/theme/tokens";

// dev 전용 프리뷰 목록 — 릴리스에서는 빈 화면. 목록은 scripts/previews.tsx.
const PREVIEWS: { name: string; title: string }[] = __DEV__
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require("../../../scripts/previews") as typeof import("../../../scripts/previews")).PREVIEWS
  : [];

const ROUTES: { href: string; title: string }[] = [
  { href: "/(tabs)/gallery", title: "탭: 갤러리" },
  { href: "/(tabs)/filter", title: "탭: 필터" },
  { href: "/(tabs)/photos", title: "탭: 내 사진" },
  { href: "/(tabs)/profile", title: "탭: 프로필" },
  { href: "/guide", title: "첫 실행 가이드" },
  { href: "/store", title: "스토어" },
  { href: "/concept/793", title: "옵션: 드레스룸(793)" },
  { href: "/concept/418", title: "옵션: 인생네컷(418)" },
  { href: "/concept/743", title: "옵션: 커플(743)" },
  { href: "/camera", title: "카메라(OS 기본 카메라)" },
  { href: "/editor", title: "편집기(웹뷰)" },
];

export default function DevIndex() {
  if (!__DEV__) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  return (
    <Screen scrollModel="scroll" header={<AppHeader title="dev 프리뷰" back right={<View />} />} contentStyle={{ paddingHorizontal: space.screen, gap: space.s4 }}>
      <Text size="footnote" tone="muted">컴포넌트·시트</Text>
      <Card padded={false}>
        {PREVIEWS.map((p, i) => (
          <Pressable key={p.name} accessibilityRole="button" onPress={() => router.push({ pathname: "/dev/[name]", params: { name: p.name } })} style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && { backgroundColor: color.fill }]}>
            <Text style={{ flex: 1 }}>{p.title}</Text>
            <IconChevron size={16} color={color.ink3} />
          </Pressable>
        ))}
      </Card>
      <Text size="footnote" tone="muted">실제 화면</Text>
      <Card padded={false}>
        {ROUTES.map((r, i) => (
          <Pressable key={r.href} accessibilityRole="button" onPress={() => router.push(r.href as never)} style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && { backgroundColor: color.fill }]}>
            <Text style={{ flex: 1 }}>{r.title}</Text>
            <IconChevron size={16} color={color.ink3} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 50, paddingHorizontal: space.s4 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
}));
