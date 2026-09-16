import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { Card } from "./Card";
import { Text } from "./Text";
import { Spinner } from "./Spinner";
import { Button } from "./Button";
import { IconClose } from "./icons";
import { thumbUrl } from "@/lib/concepts";
import { useGeneration, type Job } from "@/lib/generation";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { transitions } from "@/theme/motion";

// 진행 카드 — 내 사진 맨 위. 생성 중 → 완료(결과 보기) / 실패. 진입 260 / 종료 160.

export function ProgressCards() {
  const { jobs } = useGeneration();
  if (!jobs.length) return null;
  return (
    <View style={styles.stack}>
      {jobs.map((j) => <ProgressCard key={j.id} job={j} />)}
    </View>
  );
}

function ProgressCard({ job }: { job: Job }) {
  const { dismiss } = useGeneration();
  const done = job.status === "done";
  const failed = job.status === "failed";
  const thumb = done && job.images[0] ? job.images[0].uri : thumbUrl(job.concept.id);
  const open = () => router.push({ pathname: "/result/[jobId]", params: { jobId: job.id } });

  return (
    <Animated.View
      entering={FadeIn.duration(transitions.cardSettle.duration).easing(transitions.cardSettle.easing).reduceMotion(ReduceMotion.Never)}
      exiting={FadeOut.duration(transitions.cardSettle.exitDuration).reduceMotion(ReduceMotion.Never)}
    >
      <Card padded={false}>
        <Pressable disabled={!done} onPress={open} style={styles.row} accessibilityRole={done ? "button" : undefined}>
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={transitions.canvasSwap.duration} />
          <View style={styles.body}>
            <Text size="headline" numberOfLines={1}>{job.concept.title}</Text>
            {done ? (
              <Text size="footnote" tone="muted">{copy.progress.done}{job.count > 1 ? ` · ${job.images.length}장` : ""}</Text>
            ) : failed ? (
              <Text size="footnote" tone="danger" numberOfLines={3}>{job.error || copy.progress.fail}</Text>
            ) : (
              <>
                <Text size="footnote" tone="muted">{job.status === "waiting" ? copy.progress.resume : job.count > 1 ? copy.progress.hintBatch(job.count) : copy.progress.hint}</Text>
                <Text size="caption" tone="subtle" weight="medium">{copy.progress.safe}</Text>
              </>
            )}
            {done ? <Button label={copy.progress.open} size="sm" onPress={open} style={styles.cta} /> : null}
          </View>
          <View style={styles.trail}>
            {done || failed ? (
              <Pressable accessibilityRole="button" accessibilityLabel={copy.progress.dismiss} hitSlop={10} onPress={() => dismiss(job.id)}>
                <IconClose size={20} color={color.ink3} />
              </Pressable>
            ) : (
              <Spinner size={22} color={color.accent} />
            )}
          </View>
        </Pressable>
      </Card>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  stack: { gap: space.s3, paddingHorizontal: space.screen, marginBottom: space.s4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3 },
  thumb: { width: 60, height: 80, borderRadius: radius.thumb, backgroundColor: color.mat },
  body: { flex: 1, gap: space.s1 },
  cta: { alignSelf: "flex-start", marginTop: space.s1 },
  trail: { width: 28, alignItems: "center" },
}));
