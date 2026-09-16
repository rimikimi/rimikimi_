import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Share, StyleSheet, Switch, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { IconChevron, IconHeart, IconUser } from "@/ui/icons";
import { useAuth } from "@/lib/auth";
import { useQuota } from "@/lib/quota";
import { useStore } from "@/lib/store";
import { accountDelete, referralClaim } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { createProfileFrom, deleteProfile, getProfileMeta, type ProfileMeta } from "@/lib/faceProfile";
import { disableNotifications, getPermissionState, setupNotifications } from "@/lib/push";
import { NOTIFY_ON_KEY, getFlag } from "@/lib/prefs";
import { clearRegisteredPhoto } from "@/lib/photo";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 프로필 (SPEC §2): 크레딧 · 스토어 · 초대(내 코드 복사 + 친구 코드 입력 → /api/referral/claim)
// · 알림 설정("새 컨셉 알림 켜기" — 권한은 여기서만) · 계정(페이스 프로필 · 로그아웃 · 삭제 → /api/account/delete)
// · 법적 고지.
// ============================================================================

function Row({ label, value, onPress, danger, trailing }: { label: string; value?: string; onPress?: () => void; danger?: boolean; trailing?: React.ReactNode }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: color.fill }]}>
      <Text size="body" tone={danger ? "danger" : "default"} style={{ flex: 1 }}>{label}</Text>
      <View style={styles.rowTrail}>
        {value ? <Text size="footnote" tone="muted">{value}</Text> : null}
        {trailing ?? (onPress ? <IconChevron size={16} color={color.ink3} /> : null)}
      </View>
    </Pressable>
  );
}
const Sep = () => <View style={styles.sep} />;

// 초대 코드 — 내 코드(탭하면 복사) + 친구 코드 입력. 발급되지 않는 문자(0 O 1 I L)는 못 넣게 막는다.
function InviteSection({ code, token, onClaimed }: { code?: string; token?: string; onClaimed: () => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const base = getEnv().apiBase;
  const copyMine = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Haptics.selectionAsync().catch(() => undefined);
    Alert.alert(copy.invite.codeCopied);
  };
  const share = async () => {
    if (!code) return;
    try { await Share.share({ message: copy.invite.shareText(code, `${base}/invite.html?ref=${code}`) }); } catch { /* 취소 */ }
  };
  const submit = async () => {
    if (input.length !== 6 || busy || !token) return;
    setBusy(true);
    try {
      const r = await referralClaim(token, input);
      if (r.ok) { setInput(""); onClaimed(); Alert.alert(copy.invite.codeOk); }
      else Alert.alert(copy.invite.fail[r.reason || "invalid_code"] ?? copy.invite.fail.invalid_code);
    } catch {
      Alert.alert(copy.invite.fail.db_error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: space.s3 }}>
      <Text size="headline">{copy.invite.title}</Text>
      <Text size="footnote" tone="muted">{copy.invite.desc}</Text>
      {code ? (
        <Pressable accessibilityRole="button" onPress={() => { void copyMine(); }} style={({ pressed }) => [styles.myCode, pressed && { backgroundColor: color.fillPress }]}>
          <Text size="caption" tone="muted">{copy.invite.myCode}</Text>
          <Text size="title2" tabular style={{ letterSpacing: 3 }}>{code}</Text>
          <Text size="caption" tone="subtle" weight="medium">{copy.invite.tapToCopy}</Text>
        </Pressable>
      ) : null}
      <View style={styles.codeRow}>
        <TextInput
          value={input}
          onChangeText={(t) => setInput(t.toUpperCase().replace(/[^2-9ABCDEFGHJKMNPQRSTUVWXYZ]/g, "").slice(0, 6))}
          placeholder={copy.invite.enterCode}
          placeholderTextColor={color.ink3}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.codeInput}
        />
        <Button label={copy.invite.codeApply} size="sm" loading={busy} disabled={input.length !== 6} onPress={() => { void submit(); }} />
      </View>
      {code ? <Button label={copy.invite.share} variant="secondary" size="sm" onPress={() => { void share(); }} /> : null}
    </Card>
  );
}

export default function ProfileTab() {
  const { session, signOut, requireLogin } = useAuth();
  const { quota, freeLeft, refresh } = useQuota();
  const { photo, setPhoto } = useStore();
  const token = session?.access_token;
  const meta = (session?.user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = meta.full_name || meta.name || session?.user?.email || "";
  const avatar = meta.avatar_url || meta.picture;
  const base = getEnv().apiBase;

  // 알림 토글 — 사용자 의사(플래그) AND OS 권한
  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const on = await getFlag(NOTIFY_ON_KEY);
      const perm = await getPermissionState();
      setNotifyOn(on && perm === "granted");
    })();
  }, []);
  const toggleNotify = async (next: boolean) => {
    setNotifyBusy(true);
    try {
      if (next) {
        const ok = await setupNotifications(true);
        setNotifyOn(ok);
        if (!ok) {
          const perm = await getPermissionState();
          if (perm === "denied") Alert.alert(copy.notify.denied, undefined, [{ text: copy.photos.cancel }, { text: "설정 열기", onPress: () => { void Linking.openSettings(); } }]);
        }
      } else {
        await disableNotifications();
        setNotifyOn(false);
      }
    } finally {
      setNotifyBusy(false);
    }
  };

  // 페이스 프로필
  const [face, setFace] = useState<ProfileMeta | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  useEffect(() => { getProfileMeta().then(setFace); }, []);
  const makeFace = () => {
    if (!photo) { Alert.alert(copy.account.faceNeedPhoto); return; }
    requireLogin("make", async () => {
      if (!token) return;
      setFaceBusy(true);
      try { setFace(await createProfileFrom(token, [photo])); }
      catch (e) { Alert.alert((e as Error)?.message || copy.account.faceFail); }
      finally { setFaceBusy(false); }
    });
  };
  const removeFace = async () => { await deleteProfile(); setFace(null); };

  const onDeleteAccount = () => {
    Alert.alert(copy.profile.deleteAccount, copy.account.deleteConfirm, [
      { text: copy.photos.cancel, style: "cancel" },
      { text: copy.profile.deleteAccount, style: "destructive", onPress: async () => {
        if (!token) return;
        try {
          await accountDelete(token);
          await deleteProfile();
          await clearRegisteredPhoto();
          setPhoto(null);
          await signOut();
          Alert.alert(copy.account.deleteDone);
          router.navigate("/(tabs)/gallery");
        } catch (e) {
          Alert.alert((e as Error)?.message || copy.account.deleteFail);
        }
      } },
    ]);
  };

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

      {/* 크레딧 · 스토어 */}
      <Card padded={false}>
        <View style={styles.credits}>
          <View style={styles.creditLead}>
            <IconHeart size={20} color={color.accent} filled />
            <Text size="headline">{copy.profile.credits}</Text>
          </View>
          <Text size="title2" tabular>{quota ? (quota.unlimited ? copy.profile.unlimited : String(quota.credits)) : "–"}</Text>
        </View>
        <Sep />
        <Row label={copy.profile.freeToday} value={quota ? `${freeLeft}/${quota.limit}` : "–"} />
        <Sep />
        <Row label={copy.profile.store} onPress={() => requireLogin("make", () => router.push("/store"), "/store")} />
      </Card>

      {/* 초대 */}
      {session ? <InviteSection code={quota?.referralCode} token={token} onClaimed={refresh} /> : null}

      {/* 알림 */}
      <Card padded={false}>
        <Row
          label={copy.notify.toggle}
          trailing={<Switch value={notifyOn} disabled={notifyBusy} onValueChange={(v) => { void toggleNotify(v); }} trackColor={{ true: color.accent, false: color.fillPress }} thumbColor={color.card} />}
        />
        <Text size="caption" tone="subtle" weight="medium" style={styles.rowNote}>{copy.notify.desc}</Text>
      </Card>

      {/* 계정 */}
      <Card padded={false}>
        <Row label={copy.options.myPhoto} value={photo ? "등록됨" : "없음"} />
        <Sep />
        <Row
          label={copy.account.faceProfile}
          value={face ? "등록됨" : "없음"}
          trailing={
            face ? (
              <Button label={copy.account.faceDelete} variant="quiet" size="sm" onPress={() => { void removeFace(); }} />
            ) : (
              <Button label={copy.account.faceMake} variant="secondary" size="sm" loading={faceBusy} onPress={makeFace} />
            )
          }
        />
        <Text size="caption" tone="subtle" weight="medium" style={styles.rowNote}>{face ? copy.account.faceOn : copy.account.faceOff} · {copy.account.faceNote}</Text>
        {session ? (
          <>
            <Sep />
            <Row label={copy.profile.logout} onPress={() => { void signOut(); }} />
            <Sep />
            <Row label={copy.profile.deleteAccount} danger onPress={onDeleteAccount} />
          </>
        ) : null}
      </Card>

      {/* 법적 고지 */}
      <Card padded={false}>
        <Row label={copy.profile.terms} onPress={() => { void Linking.openURL(`${base}/terms.html`); }} />
        <Sep />
        <Row label={copy.profile.privacy} onPress={() => { void Linking.openURL(`${base}/privacy.html`); }} />
        <Sep />
        <Row label="환불 정책" onPress={() => { void Linking.openURL(`${base}/refund.html`); }} />
      </Card>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: { paddingHorizontal: space.screen, gap: space.s4 },
  me: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.fill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 52, height: 52 },
  credits: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.s4 },
  creditLead: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 50, paddingHorizontal: space.s4, gap: space.s2 },
  rowTrail: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  rowNote: { paddingHorizontal: space.s4, paddingBottom: space.s3 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.s4 },
  myCode: { alignItems: "center", gap: 2, padding: space.s3, borderRadius: radius.btn, backgroundColor: color.fill },
  codeRow: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  codeInput: { flex: 1, height: 44, borderRadius: radius.btn, backgroundColor: color.fill, paddingHorizontal: space.s3, color: color.ink, fontSize: 17, letterSpacing: 2 },
}));
