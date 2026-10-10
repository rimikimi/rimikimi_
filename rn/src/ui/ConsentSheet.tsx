import React from "react";
import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Button } from "./Button";
import { IconImage, IconShare, IconSparkle, IconUser } from "./icons";
import { IconPhone } from "./icons21";
import { useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { getEnv } from "@/lib/env";
import { color, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 제3자 AI(Google Gemini) 전송 고지 — 첫 "만들기" 전 1회만. iOS `UI/Consent/AIConsentSheet.swift` 와 같은
// 문구·순서·버튼(허용하고 계속 / 허용 안 함). 동의는 기기에 `ai.consent.v2` 로 기록, "허용 안 함" 은
// 이번 생성만 취소한다(다시 만들기를 누르면 또 뜬다). 루트 레이아웃이 그린다.
// 시트 바깥을 눌러 닫는 것 = "허용 안 함"(iOS 는 끌어 닫기를 막았다 — 여기선 닫히면 취소로 친다).
// ============================================================================

const MAX_H = Math.round(Dimensions.get("window").height * 0.7);

function Row({ Icon, text }: { Icon: typeof IconSparkle; text: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}><Icon size={16} color={color.accent} /></View>
      <Text size="callout" tone="muted" style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

export function ConsentSheet() {
  const { consentOpen, agreeConsent, declineConsent } = useApp21();
  return (
    <Sheet open={consentOpen} onClose={declineConsent}>
      <ScrollView style={{ maxHeight: MAX_H }} contentContainerStyle={{ gap: space.s4, paddingTop: space.s2 }}>
        <Text size="title2">{c21.consentTitle}</Text>
        <View style={{ gap: space.s3 }}>
          <Row Icon={IconSparkle} text={c21.consentAI} />
          <Row Icon={IconShare} text={c21.consentUpload} />
          <Row Icon={IconPhone} text={c21.consentDevice} />
          <Row Icon={IconUser} text={c21.consentOwnPhoto} />
          <Row Icon={IconImage} text={c21.consentIDNote} />
        </View>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`${getEnv().apiBase}/privacy`); }}>
          <Text size="footnote" tone="accent">{c21.consentPrivacyLink}</Text>
        </Pressable>
        <View style={{ gap: space.s2, marginTop: space.s2 }}>
          <Button label={c21.consentAgree} full onPress={agreeConsent} />
          {/* iOS TextButtonStyle(color: .ink2) — 회색 글자 버튼 */}
          <Pressable accessibilityRole="button" onPress={declineConsent} style={styles.later} hitSlop={8}>
            <Text size="callout" weight="semibold" tone="muted">{c21.consentLater}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.s3 },
  icon: { width: 22, paddingTop: 2, alignItems: "center" },
  later: { alignSelf: "center", paddingVertical: space.s2, paddingHorizontal: space.s4 },
}));
