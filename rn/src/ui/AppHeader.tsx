import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Glass } from "./Screen";
import { Text } from "./Text";
import { Logo } from "./Logo";
import { CreditChip } from "./CreditChip";
import { IconArrowLeft, IconUser } from "./icons";
import { useAuth } from "@/lib/auth";
import { chrome, color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// Pinned top bar. Glass — chrome only (SPEC §0).
//   · 홈: 로고가 제목(큰 제목 없음) + [크레딧 칩][아바타]
//   · 안쪽 화면: 가운데 작은 제목(Headline 17/600) + 뒤로
// ============================================================================

export function AppHeader({ title, back, right }: { title?: string; back?: boolean; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const avatar = (session?.user?.user_metadata as { avatar_url?: string; picture?: string } | undefined)?.avatar_url
    ?? (session?.user?.user_metadata as { picture?: string } | undefined)?.picture;

  return (
    <Glass style={[styles.bar, { paddingTop: insets.top, height: insets.top + chrome.headerH }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
              <IconArrowLeft size={24} color={color.ink} />
            </Pressable>
          ) : title ? null : (
            <Logo height={24} />
          )}
        </View>
        <View style={styles.center} pointerEvents="none">
          {title ? <Text size="headline" numberOfLines={1}>{title}</Text> : null}
        </View>
        <View style={[styles.side, styles.sideRight]}>
          {right ?? (
            <>
              <CreditChip />
              <Pressable accessibilityRole="button" accessibilityLabel="프로필" hitSlop={8} onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <IconUser size={20} color={color.ink2} />
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Glass>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  row: { height: chrome.headerH, flexDirection: "row", alignItems: "center", paddingHorizontal: space.screen },
  side: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s2 },
  sideRight: { justifyContent: "flex-end" },
  center: { flex: 2, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -space.s2 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.fill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 32, height: 32 },
}));
