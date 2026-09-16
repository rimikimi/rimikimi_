import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { Card } from "./Card";
import { Text } from "./Text";
import { Button } from "./Button";
import { IconClose } from "./icons";
import { INVITE_CARD_DONE_KEY, INVITE_CARD_DUE_KEY, getFlag, setFlag } from "@/lib/prefs";
import { copy } from "@/lib/copy";
import { color, space, themedStyles } from "@/theme/tokens";
import { transitions } from "@/theme/motion";

// 첫 생성 완료 후 홈 상단 초대 카드 — 1회. 닫거나 열면 다시 안 뜬다.
export function InviteCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    (async () => {
      if ((await getFlag(INVITE_CARD_DUE_KEY)) && !(await getFlag(INVITE_CARD_DONE_KEY))) setShow(true);
    })();
  }, []);
  if (!show) return null;
  const done = () => { setShow(false); void setFlag(INVITE_CARD_DONE_KEY, true); };
  return (
    <Animated.View
      style={styles.wrap}
      entering={FadeIn.duration(transitions.cardSettle.duration).reduceMotion(ReduceMotion.Never)}
      exiting={FadeOut.duration(transitions.cardSettle.exitDuration).reduceMotion(ReduceMotion.Never)}
    >
      <Card>
        <View style={styles.head}>
          <Text size="headline" style={{ flex: 1 }}>{copy.invite.cardTitle}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.common.close} hitSlop={10} onPress={done}>
            <IconClose size={20} color={color.ink3} />
          </Pressable>
        </View>
        <Text size="footnote" tone="muted" style={{ marginTop: space.s1 }}>{copy.invite.cardDesc}</Text>
        <Button label={copy.invite.cardCta} size="sm" style={{ alignSelf: "flex-start", marginTop: space.s3 }} onPress={() => { done(); router.push("/(tabs)/profile"); }} />
      </Card>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { paddingHorizontal: space.screen, marginBottom: space.s4 },
  head: { flexDirection: "row", alignItems: "center", gap: space.s2 },
}));
