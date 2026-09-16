import SwiftUI

/// 가로 줄 — 제목(20/700) [+ NEW 배지] + 오른쪽 "더보기"(15/600 강조색) + 카드들.
/// 목업 `scratchpad/mock.html #home` 의 `.rowh` / `.rail` / `.card` 와 같은 치수.
struct ConceptRail: View {
    var title: String
    var concepts: [Concept]
    var isNew = false
    var more: Route? = nil

    var body: some View {
        if !concepts.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                    Text(title).font(AppFont.sectionTitle).tracking(Tracking.sectionTitle)
                    if isNew { NewBadge() }
                    Spacer()
                    if let more {
                        NavigationLink(value: more) {
                            Text("더보기").font(AppFont.calloutEmphasis).foregroundStyle(Color.accent)
                        }
                        .buttonStyle(TextButtonStyle(color: .accent))
                    }
                }
                .padding(.horizontal, Spacing.page)
                .padding(.top, Spacing.s1)
                .padding(.bottom, Spacing.s3 - 2)
                .accessibilityAddTraits(.isHeader)

                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: CardMetrics.railGap) {
                        ForEach(concepts) { c in
                            ConceptCard(concept: c)
                                .containerRelativeFrame(.horizontal) { w, _ in (w * CardMetrics.railCardFraction).rounded() }
                        }
                    }
                    .padding(.horizontal, Spacing.page)
                    .scrollTargetLayout()
                }
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
                .padding(.bottom, CardMetrics.railBottom)
            }
        }
    }
}

/// NEW — 빨간 작은 배지 #E6403C, 11/700, 모서리 5.
struct NewBadge: View {
    var body: some View {
        Text("NEW")
            .font(AppFont.badge).tracking(0.4)
            .foregroundStyle(Color.white)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Color.accent, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
            .offset(y: -2)
            .accessibilityLabel("새로 나옴")
    }
}

/// 컨셉 카드 — 흰 카드(모서리 14) 안에 3:4 썸네일 + 제목 14/600 한 줄 말줄임. 탭 → 옵션 화면(푸시).
struct ConceptCard: View {
    var concept: Concept

    var body: some View {
        NavigationLink(value: Route.concept(concept)) {
            VStack(alignment: .leading, spacing: 0) {
                RemoteImage(url: concept.thumbURL, cornerRadius: 0)
                    .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                Text(concept.title)
                    .font(AppFont.cardTitle)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.horizontal, Spacing.s3)
                    .padding(.top, 9).padding(.bottom, 11)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.card)
            .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
            .shadow(color: .black.opacity(0.10), radius: 12, y: 8)
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}

/// 두 열 그리드 — 카테고리 화면.
struct ConceptGrid: View {
    var concepts: [Concept]
    private let columns = [GridItem(.flexible(), spacing: CardMetrics.railGap), GridItem(.flexible(), spacing: CardMetrics.railGap)]

    var body: some View {
        if concepts.isEmpty {
            EmptyState(message: "검색 결과가 없어요")
        } else {
            LazyVGrid(columns: columns, spacing: Spacing.s4) {
                ForEach(concepts) { c in ConceptCard(concept: c) }
            }
            .padding(.horizontal, Spacing.page)
        }
    }
}
