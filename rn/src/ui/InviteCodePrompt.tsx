// 가입 직후 1회 — "친구 초대로 오셨나요?" (2026-11-15). 보상: 초대한 사람 5장, 초대 코드로 가입한 사람 3장(api/_lib/credits.js).
// 8/27 이후 초대 기록이 0건이었다: 초대 링크(public/invite.html)를 타고 설치해도 앱이 코드를 못 받아서,
// 친구가 설정에서 코드를 직접 쳐야만 인정됐기 때문. 그래서
//   ① 초대 페이지가 Play 스토어 링크에 실어 둔 install referrer(utm_content=CODE)를 읽어 칸을 미리 채우고,
//   ② 클립보드("rimikimi-invite:CODE")에서 붙여넣기 버튼으로도 채운다.
// 대상은 서버 quota.inviteEligible(가입 7일 이내·초대 미등록), 계정당 한 번(AsyncStorage). 보상은 초대한 사람에게 5장(11/15 3→5).
import { useEffect, useState } from "react";
import { Platform, StyleSheet, TextInput, ToastAndroid, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Clipboard from "expo-clipboard";
import { Sheet } from "@/ui/Sheet";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { useAuth } from "@/lib/auth";
import { useQuota } from "@/lib/quota";
import { referralClaim } from "@/lib/api";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";

const CODE_CHARS = /[^2-9ABCDEFGHJKMNPQRSTUVWXYZ]/g;

/** "rimikimi-invite:A3F9K2" · 초대 링크(…/i/A3F9K2) · "utm_content=A3F9K2" · 코드만 → 6자 코드. */
export function extractInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = decodeURIComponent(String(raw)).toUpperCase();
  const tail = s.split(/RIMIKIMI-INVITE:|\/I\/|UTM_CONTENT=/).pop() ?? s;
  const m = tail.match(/[2-9ABCDEFGHJKMNPQRSTUVWXYZ]{6}/);
  return m ? m[0] : null;
}

export function InviteCodePrompt() {
  const { session } = useAuth();
  const { quota, refresh } = useQuota();
  const uid = session?.user?.id;
  const token = session?.access_token;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid || quota?.inviteEligible !== true) return;
    let cancelled = false;
    (async () => {
      const key = `invitePrompted.${uid}`;
      if (await AsyncStorage.getItem(key).catch(() => "1")) return;
      await AsyncStorage.setItem(key, "1").catch(() => undefined);
      let pre: string | null = null;
      if (Platform.OS === "android") {
        // 엄격하게 — 초대 페이지가 실은 utm_content=CODE 만 인정한다. 일반 설치의 referrer("utm_source=google-play&utm_medium=organic")
        //   안의 아무 6글자를 코드로 오인해 자동 등록하면 안 된다.
        const ref = decodeURIComponent(String(await Application.getInstallReferrerAsync().catch(() => "") || ""));
        const m = ref.match(/(?:^|&)utm_content=([2-9A-HJKMNP-Za-hjkmnp-z]{6})(?:&|$)/);
        pre = m ? m[1].toUpperCase() : null;
      }
      if (cancelled) return;
      // 초대 링크로 설치(Play install referrer 에 코드) → 창 없이 바로 등록(오너 11/15 "링크로 들어와서 가입하면 코드 안 넣어도 되게").
      //   실패(없는 코드·내 코드 등)하면 아래 창을 코드가 채워진 채로 연다. 이미 등록했으면 조용히 끝.
      if (pre && token) {
        const r = await referralClaim(token, pre).catch(() => ({ ok: false, reason: "db_error" }));
        if (cancelled) return;
        if (r.ok) { if (Platform.OS === "android") ToastAndroid.show(copy.invite.autoOk, ToastAndroid.LONG); refresh(); return; }
        if (r.reason === "already_referred") return;
      }
      if (pre) setInput(pre);
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [uid, quota?.inviteEligible, token, refresh]);

  const paste = async () => {
    const c = extractInviteCode(await Clipboard.getStringAsync().catch(() => ""));
    if (c) setInput(c);
  };

  const say = (m: string) => { if (Platform.OS === "android") ToastAndroid.show(m, ToastAndroid.SHORT); };

  const submit = async () => {
    if (input.length !== 6 || busy || !token) return;
    setBusy(true);
    try {
      const r = await referralClaim(token, input);
      if (r.ok) { say(copy.invite.codeOk); setOpen(false); refresh(); }
      else {
        say(copy.invite.fail[r.reason || "invalid_code"] ?? copy.invite.fail.invalid_code);
        if (r.reason === "already_referred" || r.reason === "self_referral") setOpen(false);
      }
    } catch {
      say(copy.invite.fail.db_error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <View style={styles.wrap}>
        <Text size="title2">{copy.invite.askTitle}</Text>
        <Text size="footnote" tone="muted">{copy.invite.askDesc}</Text>
        <View style={styles.row}>
          <TextInput
            value={input}
            onChangeText={(t) => setInput(t.toUpperCase().replace(CODE_CHARS, "").slice(0, 6))}
            placeholder={copy.invite.enterCode}
            placeholderTextColor={color.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.input}
          />
          <Button label={copy.invite.paste} variant="secondary" size="sm" onPress={() => { void paste(); }} />
        </View>
        <Button label={copy.invite.codeApply} loading={busy} disabled={input.length !== 6} onPress={() => { void submit(); }} />
        <Button label={copy.invite.noCode} variant="secondary" onPress={() => setOpen(false)} />
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { gap: space.s3, paddingBottom: space.s2 },
  row: { flexDirection: "row", gap: space.s2, alignItems: "center" },
  input: { flex: 1, height: 48, borderRadius: radius.btn, backgroundColor: color.fill, paddingHorizontal: space.s3, color: color.ink, fontSize: 20, fontWeight: "700", letterSpacing: 3 },
}));
