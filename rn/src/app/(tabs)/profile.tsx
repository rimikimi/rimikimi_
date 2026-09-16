import React from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { IconChevron, IconHeart, IconUser } from "@/ui/icons";
import { useAuth } from "@/lib/auth";
import { useQuota } from "@/lib/quota";
import { useStore } from "@/lib/store";
import { getEnv } from "@/lib/env";
import { copy } from "@/lib/copy";
import { color, radius, space } from "@/theme/tokens";

// 프로필 — 크레딧·스토어·초대·알림 설정·계정·법적 고지 (SPEC §2). 스토어·초대·알림은 2주차 자리표시.

function Row({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }]}>
      <Text size="body" tone={danger ? "danger" : "default"}>{label}</Text>
      <View style={styles.rowTrail}>
        {value ? <Text size="footnote" tone="muted">{value}</Text> : null}
        {onPress ? <IconChevron size={16} color={color.ink3} /> : null}
      </View>
    </Pressable>
  );
}

export default function ProfileTab() {
  const { session, signOut, requireLogin } = useAuth();
  const { quota, freeLeft } = useQuota();
  const { photo } = useStore();
  const meta = (session?.user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = meta.full_name || meta.name || session?.user?.email || "";
  const avatar = meta.avatar_url || meta.picture;
  const base = getEnv().apiBase;
  const soon = () => Alert.alert(copy.profile.soon);

  return (
    <Screen scrollModel="scroll" hasTabBar header={<AppHeader title={copy.profile.title} />} contentStyle={styles.content}>
      <Card>
        {session ? (
          <View style={styles.me}>
            <View style={styles.avatar}>
              {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" /> : <IconUser size={28} color={color.ink2} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text size="headline" numberOfLines={1}>{name}</Text>
              <Text size="footnote" tone="muted" numberOfLines={1}>{session.user.email ?? ""}</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: space.s3 }}>
            <Text size="headline">{copy.profile.guestTitle}</Text>
            <Text size="footnote" tone="muted">{copy.profile.guestDesc}</Text>
            <Button label={copy.profile.login} onPress={() => requireLogin("make", () => undefined)} />
          </View>
        )}
      </Card>

      <Card padded={false}>
        <View style={styles.credits}>
          <View style={styles.creditLead}>
            <IconHeart size={20} color={color.accent} filled />
            <Text size="headline">{copy.profile.credits}</Text>
          </View>
          <Text size="title2" tabular>{quota ? (quota.unlimited ? copy.profile.unlimited : String(quota.credits)) : "–"}</Text>
        </View>
        <View style={styles.sep} />
        <Row label={copy.profile.freeToday} value={quota ? `${freeLeft}/${quota.limit}` : "–"} />
        <View style={styles.sep} />
        <Row label={copy.profile.store} onPress={soon} />
        <View style={styles.sep} />
        <Row label={copy.profile.invite} onPress={soon} />
      </Card>

      <Card padded={false}>
        <Row label={copy.profile.notify} onPress={soon} />
      </Card>

      <Card padded={false}>
        <Row label={copy.options.myPhoto} value={photo ? "등록됨" : "없음"} />
        <View style={styles.sep} />
        <Row label={copy.profile.terms} onPress={() => { void Linking.openURL(`${base}/terms.html`); }} />
        <View style={styles.sep} />
        <Row label={copy.profile.privacy} onPress={() => { void Linking.openURL(`${base}/privacy.html`); }} />
        {session ? (
          <>
            <View style={styles.sep} />
            <Row label={copy.profile.logout} onPress={() => { void signOut(); }} />
            <View style={styles.sep} />
            <Row label={copy.profile.deleteAccount} danger onPress={() => { void Linking.openURL(`${base}/delete-account.html`); }} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, gap: space.s4 },
  me: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.fill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 52, height: 52 },
  credits: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.s4 },
  creditLead: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 50, paddingHorizontal: space.s4 },
  rowTrail: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.s4 },
});
