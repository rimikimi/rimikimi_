import React, { useMemo } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { DensePhotoGrid } from "@/ui/DensePhotoGrid";
import { FavoriteStarButton } from "@/ui/FavoriteBits";
import { useStore } from "@/lib/store";
import { conceptsIn } from "@/lib/concepts";

// 카테고리 더보기 — 빽빽한 격자(핀치로 3열 ↔ 5열), 최신순. 탭 = 필름스트립 브라우저.
// 2열 카드 격자였던 것을 iOS 2.0 과 맞췄다(오너 지시 2026-09-22 "안드로이드도 동일하게").
export default function CategoryScreen() {
  const { name, cols } = useLocalSearchParams<{ name: string; cols?: string }>();
  const { concepts, favoriteConcepts, isFavoriteCategory, toggleFavoriteCategory } = useStore();
  const items = useMemo(
    () => conceptsIn(concepts, name ?? "", favoriteConcepts),
    [concepts, name, favoriteConcepts],
  );
  return (
    <Screen
      scrollModel="scroll"
      header={
        <AppHeader
          title={name ?? ""}
          back
          // 즐겨찾기한 카테고리는 홈 앨범 격자에서 위로 올라온다(오너 지시 "실제로 배열도 바꿔주고").
          right={
            <FavoriteStarButton
              on={isFavoriteCategory(name ?? "")}
              onPress={() => toggleFavoriteCategory(name ?? "")}
            />
          }
        />
      }
    >
      <DensePhotoGrid
        items={items}
        startWide={cols === "5"}
        onOpen={(c) =>
          router.push({ pathname: "/browse/[name]", params: { name: name ?? "", start: String(c.id) } })
        }
      />
    </Screen>
  );
}
