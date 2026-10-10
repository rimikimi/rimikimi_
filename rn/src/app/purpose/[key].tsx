import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Chip } from "@/ui/Chip";
import { DensePhotoGrid } from "@/ui/DensePhotoGrid";
import { CartBar } from "@/ui/CartBar";
import { CoachHost } from "@/ui/Coach";
import { DressFilterSheet, ToolButton } from "@/ui/StudioSheets";
import { IconFunnel, IconHeartCircle } from "@/ui/icons21";
import { useStore } from "@/lib/store";
import { Coach, useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { byNewest, conceptPool, conceptsIn, isFeatureConcept, type Concept } from "@/lib/concepts";
import { albumName, albumTiles, conceptsForPurpose, purposeTitle, type Purpose } from "@/lib/home21";
import { FAVORITES_ALBUM } from "@/lib/favorites";
import { STUDIO_TABS, dressConcept, dressList, studioLooks } from "@/lib/studio";
import { pickPhotos } from "@/lib/photo";
import { space } from "@/theme/tokens";

// ============================================================================
// 목적 화면 — iOS 2.1 `PurposeView.swift`. 위에 탭(칩), 그 아래 옵션 버튼(웨딩만), 3열 격자(핀치 5열).
// 탭 = 크게 보기, 길게 누르기 = 담기(오너 지시 2026-10-09). 담은 건 아래 줄에 모인다.
//   · 증명·프로필 = 브루클린 룩(/studio-catalog.json): 이력서·취업 / 전문 프로필 / 배우·모델.
//     격자엔 옵션 버튼을 두지 않는다 — 세부 조정·옷 바꾸기는 "N장 만들기" 다음 단계(StudioStepSheet).
//   · 웨딩·커플 = 웨딩 컨셉 / 본식 드레스 / 2부 드레스(+ 개수) · 드레스 필터 시트 · 신랑도 함께.
//   · 컨셉화보 = 오늘의 새 컨셉(최신 12) + 카테고리 칩.
//   · 프사·소개팅 = purposes 에 "snap" 이 든 컨셉.
// ============================================================================

export default function PurposeScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const purpose = (["profile", "snap", "wedding", "concept"].includes(key ?? "") ? key : "concept") as Purpose;
  const { concepts, seasons, favoriteCategories, favoriteConcepts } = useStore();
  const { catalog, dresses, loadStudio, dressFilter, groom, setGroom, setBrowseList, enqueueCoach, labelsVersion } = useApp21();
  const [segment, setSegment] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => { loadStudio(); }, [loadStudio]);
  useEffect(() => { enqueueCoach(Coach.grid()); }, [enqueueCoach]);

  const segments = useMemo<{ key: string; title: string }[]>(() => {
    switch (purpose) {
      case "profile":
        // 브루클린 목적 3개(SNS 는 프사·소개팅이 리미키미 일상 스냅이라 넣지 않는다).
        return catalog ? STUDIO_TABS.map((k) => ({ key: k, title: c21.studioTab(k) })) : [];
      case "wedding":
        return [
          { key: "concepts", title: `${c21.weddingTab("concepts")} ${conceptsForPurpose(concepts, "wedding").length}` },
          { key: "main", title: `${c21.weddingTab("main")} ${dressList(dresses, "main", dressFilter).length}` },
          { key: "after", title: `${c21.weddingTab("after")} ${dressList(dresses, "after", dressFilter).length}` },
        ];
      case "concept": {
        const cats = albumTiles(concepts, seasons, favoriteCategories, favoriteConcepts).map((t) => t.name).filter((n) => n !== FAVORITES_ALBUM);
        return [{ key: "today", title: c21.segToday }, ...cats.map((n) => ({ key: n, title: albumName(n) }))];
      }
      default:
        return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, catalog, concepts, dresses, dressFilter, seasons, favoriteCategories, favoriteConcepts, labelsVersion]);
  const current = segment || segments[0]?.key || "";

  const items = useMemo<Concept[]>(() => {
    switch (purpose) {
      case "profile": return studioLooks(catalog, current);
      case "wedding":
        if (current === "main" || current === "after") return dressList(dresses, current, dressFilter).map(dressConcept);
        return conceptsForPurpose(concepts, "wedding");
      case "concept":
        return current === "today"
          ? conceptPool(concepts).filter((c) => !isFeatureConcept(c)).sort(byNewest).slice(0, 12)
          : conceptsIn(conceptPool(concepts), current, favoriteConcepts);
      case "snap": return conceptsForPurpose(concepts, "snap");
    }
  }, [purpose, current, catalog, dresses, dressFilter, concepts, favoriteConcepts]);

  const segTitle = segments.find((s) => s.key === current)?.title ?? purposeTitle(purpose);
  const nf = Object.values(dressFilter).reduce((a, v) => a + (v?.length ?? 0), 0);

  return (
    <View style={{ flex: 1 }}>
      <Screen scrollModel="scroll" header={<AppHeader title={purposeTitle(purpose)} back right={<View />} />} actionBar>
        {segments.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} overScrollMode="never">
            {segments.map((s) => (
              <Chip key={s.key} label={s.title} active={current === s.key} onPress={() => { setSegment(s.key); Haptics.selectionAsync().catch(() => {}); }} />
            ))}
          </ScrollView>
        ) : null}
        {purpose === "wedding" ? (
          <View style={styles.tools}>
            {current !== "concepts" ? (
              <ToolButton title={c21.filter + (nf > 0 ? ` · ${nf}` : "")} Icon={IconFunnel} on={nf > 0} onPress={() => setFilterOpen(true)} />
            ) : null}
            <ToolButton
              title={groom ? c21.groomAdded : c21.withGroom}
              Icon={IconHeartCircle}
              on={!!groom}
              onPress={async () => {
                if (groom) { setGroom(null); return; }
                const [p] = await pickPhotos();
                if (p) setGroom(p);
              }}
            />
          </View>
        ) : null}
        <DensePhotoGrid
          key={purpose + current}
          items={items}
          onOpen={(c) => {
            // 탭 = 네이티브 사진 앱식 크게 보기 + 아래 필름스트립 — 그 격자의 목록을 그대로 넘긴다.
            setBrowseList(items);
            router.push({ pathname: "/browse/[name]", params: { name: segTitle, start: String(c.id), list: "1" } });
          }}
        />
      </Screen>
      <CartBar />
      <DressFilterSheet kind={current} open={filterOpen} onClose={() => setFilterOpen(false)} />
      <CoachHost keys={["firstTile", "cartMake"]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: space.screen, gap: space.s2, paddingVertical: space.s2 },
  tools: { flexDirection: "row", gap: space.s2, paddingHorizontal: space.screen, paddingTop: space.s2, paddingBottom: space.s1 },
});
