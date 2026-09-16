import React from "react";
import { View } from "react-native";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Segmented } from "@/ui/Segmented";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { Logo } from "@/ui/Logo";
import { Sheet } from "@/ui/Sheet";
import { FitSheet } from "@/ui/FitSheet";
import { PackRows, RestoreButton, StoreMessage, SubRows } from "@/ui/StoreList";
import { ConceptRail } from "@/ui/ConceptCard";
import { ProgressCards } from "@/ui/ProgressCard";
import { InviteCard } from "@/ui/InviteCard";
import { useStoreFlow } from "@/lib/storeFlow";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useCreditGate } from "@/lib/creditGate";
import { color, space } from "@/theme/tokens";

// ============================================================================
// dev 전용 화면 프리뷰 — Storybook 없이 화면/컴포넌트를 하나씩 띄운다.
//   npx expo start → 앱에서 /dev 로 이동 (또는 `npx uri-scheme open com.rimikimi.app://dev --android`)
// 릴리스 번들(__DEV__ = false)에서는 목록이 비고 라우트는 빈 화면이다.
// 실제 화면(탭·옵션·결과)은 라우트로 바로 갈 수 있으니 여기엔 "상태를 만들기 어려운 것"만 둔다:
// 시트 3종, 스토어 목록, 진행 카드, 초대 카드, 토큰 견본.
// ============================================================================

function Tokens() {
  const [seg, setSeg] = React.useState<"a" | "b">("a");
  return (
    <Screen scrollModel="scroll" header={<AppHeader title="토큰 · 컴포넌트" back right={<View />} />} contentStyle={{ paddingHorizontal: space.screen, gap: space.s4 }}>
      <Logo height={32} />
      <Text size="title2">Title2 22/700</Text>
      <Text size="headline">Headline 17/600</Text>
      <Text size="body">Body 17 — 시스템 글꼴(Roboto / Noto Sans KR)</Text>
      <Text size="callout" tone="muted">Callout 15 · 2차 60%</Text>
      <Text size="footnote" tone="subtle">Footnote 13/500 · 3차 30%</Text>
      <Text size="caption">Caption 11/600</Text>
      <Button label="주 버튼 50" full />
      <Button label="2차 버튼" variant="secondary" full />
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <Button label="작은 36" size="sm" />
        <Button label="quiet" variant="quiet" size="sm" />
        <Button label="loading" size="sm" loading />
      </View>
      <View style={{ flexDirection: "row", gap: space.s2, flexWrap: "wrap" }}>
        {color.hearts.map((h, i) => <Chip key={h} label={`하트 ${i + 1}`} active activeColor={h} />)}
        <Chip label="비활성" />
      </View>
      <Segmented options={[{ value: "a", label: "거울셀카" }, { value: "b", label: "일상컷" }] as const} value={seg} onChange={setSeg} />
      <Card><Text>카드 14 · 흰색 · 그림자 없음</Text></Card>
    </Screen>
  );
}

function LoginSheetPreview() {
  const { requireLogin } = useAuth();
  return (
    <Screen scrollModel="fixed" header={<AppHeader title="로그인 시트" back right={<View />} />} contentStyle={{ padding: space.screen, gap: space.s3 }}>
      <Button label="만들기 이유로 열기" onPress={() => requireLogin("make", () => undefined)} />
      <Button label="필터 이유로 열기" variant="secondary" onPress={() => requireLogin("filter", () => undefined)} />
      <Button label="카메라 이유로 열기" variant="secondary" onPress={() => requireLogin("camera", () => undefined)} />
    </Screen>
  );
}

function CreditSheetPreview() {
  const gate = useCreditGate();
  return (
    <Screen scrollModel="fixed" header={<AppHeader title="크레딧 부족 시트" back right={<View />} />} contentStyle={{ padding: space.screen, gap: space.s3 }}>
      <Text size="footnote" tone="muted">잔액과 무관하게 강제로 연다(3 크레딧 필요 가정).</Text>
      <Button label="시트 열기" onPress={() => gate.request(Number.MAX_SAFE_INTEGER, () => undefined)} />
    </Screen>
  );
}

function StorePreview() {
  const flow = useStoreFlow();
  return (
    <Screen scrollModel="scroll" header={<AppHeader title="스토어 목록" back right={<View />} />} contentStyle={{ paddingHorizontal: space.screen, gap: space.s4 }}>
      <Text size="footnote" tone="muted">RC 키 {flow.available ? "있음" : "없음"} · 상품 {flow.packs.length}개 · {flow.loading ? "로딩" : "완료"}</Text>
      <PackRows flow={flow} />
      <SubRows flow={flow} />
      <StoreMessage flow={flow} />
      <RestoreButton flow={flow} />
    </Screen>
  );
}

function SheetPreview() {
  const [open, setOpen] = React.useState(false);
  const [fit, setFit] = React.useState(false);
  return (
    <Screen scrollModel="fixed" header={<AppHeader title="시트" back right={<View />} />} contentStyle={{ padding: space.screen, gap: space.s3 }}>
      <Button label="기본 시트(드래그 1:1 · 45% 닫힘)" onPress={() => setOpen(true)} />
      <Button label="정방향 맞춤 시트" variant="secondary" onPress={() => setFit(true)} />
      <Sheet open={open} title="시트 제목" onClose={() => setOpen(false)}>
        <Text tone="muted">열림 320 · 닫힘 220 · 곡선 (0.32,0.72,0,1)</Text>
        <Button label="닫기" variant="secondary" onPress={() => setOpen(false)} />
      </Sheet>
      <FitSheet open={fit} uri={null} onClose={() => setFit(false)} onFitted={() => undefined} />
    </Screen>
  );
}

function CardsPreview() {
  const { home } = useStore();
  return (
    <Screen scrollModel="scroll" header={<AppHeader title="카드 · 줄" back right={<View />} />} contentStyle={{ gap: space.s4 }}>
      <InviteCard />
      <ProgressCards />
      <Text size="footnote" tone="muted" style={{ paddingHorizontal: space.screen }}>진행 카드는 실제 작업이 있을 때만 보인다(내 사진 탭과 같은 소스).</Text>
      {home ? <ConceptRail title="추천(실데이터)" items={home.featured} big /> : null}
    </Screen>
  );
}

export const PREVIEWS: { name: string; title: string; Component: React.ComponentType }[] = [
  { name: "tokens", title: "토큰 · 컴포넌트", Component: Tokens },
  { name: "login", title: "로그인 시트", Component: LoginSheetPreview },
  { name: "credit", title: "크레딧 부족 시트", Component: CreditSheetPreview },
  { name: "store", title: "스토어 목록", Component: StorePreview },
  { name: "sheet", title: "시트 · 정방향 맞춤", Component: SheetPreview },
  { name: "cards", title: "초대 카드 · 진행 카드 · 줄", Component: CardsPreview },
];
