import React, { useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { DensePhotoGrid } from "@/ui/DensePhotoGrid";
import { CartBar } from "@/ui/CartBar";
import { useStore } from "@/lib/store";
import { ART_CATEGORY, conceptPool, conceptsIn } from "@/lib/concepts";
import { c21, t } from "@/lib/copy21";
import { color, space } from "@/theme/tokens";

// 매직 부스 탭 — iOS RootTabView .magic(CategoryListView(Concept.artCategory)) 이식(2026-10-26 5탭).
// 맨 위 설명: 사람·반려동물·풍경 뭐든 올리면 고른 그림체로 바꿔 준다(오너 "사용자가 넣는 사진을 뭐든지 저 분위기로").
export default function MagicTab() {
  const { concepts, favoriteConcepts } = useStore();
  const items = useMemo(() => conceptsIn(conceptPool(concepts), ART_CATEGORY, favoriteConcepts), [concepts, favoriteConcepts]);
  return (
    <View style={{ flex: 1 }}>
      <Screen scrollModel="scroll" hasTabBar header={<AppHeader title={c21.tabMagic} right={<View />} />}>
        <View style={{ paddingHorizontal: space.screen, paddingTop: space.s2, paddingBottom: space.s4, gap: 4 }}>
          <Text size="headline" weight="bold">{t("어떤 사진이든 이 그림체로", "Any photo, in this style")}</Text>
          <Text size="callout" style={{ color: color.ink2 }}>
            {t("사람·반려동물·풍경 뭐든 올리면 고른 그림체로 바꿔 드려요.", "People, pets, places — upload anything and we redraw it in the style you pick.")}
          </Text>
        </View>
        <DensePhotoGrid
          items={items}
          onOpen={(c) => router.push({ pathname: "/browse/[name]", params: { name: ART_CATEGORY, start: String(c.id) } })}
        />
      </Screen>
      <CartBar />
    </View>
  );
}
