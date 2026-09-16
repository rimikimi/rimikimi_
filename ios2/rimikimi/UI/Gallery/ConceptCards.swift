import SwiftUI

/// 가로 줄 — 제목 + 카드들. `big` 은 추천/새로 나왔어요(200pt), 아니면 카테고리 줄(150pt).
struct ConceptRail: View {
    var title: String
    var concepts: [Concept]
    var big: Bool
    var more: Route? = nil

    var body: some View {
        if !concepts.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title).font(AppFont.headline).tracking(Tracking.headline)
                    Spacer()
                    if let more {
                        NavigationLink(value: more) {
                            Text("더보기 →").font(AppFont.calloutEmphasis).foregroundStyle(Color.ink2)
                        }
                        .buttonStyle(TextButtonStyle(color: .ink2))
                    }
                }
                .padding(.horizontal, Spacing.page)
                .padding(.top, Spacing.s5)
                .padding(.bottom, Spacing.s3)
                .accessibilityAddTraits(.isHeader)

                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: Spacing.s3) {
                        ForEach(concepts) { c in
                            ConceptCard(concept: c, width: big ? CardMetrics.bigRailCardWidth : CardMetrics.railCardWidth)
                        }
                    }
                    .padding(.horizontal, Spacing.page)
                }
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
            }
        }
    }
}

/// 컨셉 카드 — 3:4 썸네일 + 제목. 탭 → 옵션 화면(푸시).
struct ConceptCard: View {
    var concept: Concept
    var width: CGFloat

    var body: some View {
        NavigationLink(value: Route.concept(concept)) {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                RemoteImage(url: concept.thumbURL, cornerRadius: Radius.card)
                    .frame(width: width, height: width / CardMetrics.aspect)
                Text(concept.title)
                    .font(AppFont.footnote)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .frame(width: width, alignment: .leading)
            }
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}

/// 두 열 그리드 — 카테고리 화면.
struct ConceptGrid: View {
    var concepts: [Concept]
    private let columns = [GridItem(.flexible(), spacing: Spacing.s3), GridItem(.flexible(), spacing: Spacing.s3)]

    var body: some View {
        if concepts.isEmpty {
            EmptyState(message: "검색 결과가 없어요")
        } else {
            LazyVGrid(columns: columns, spacing: Spacing.s4) {
                ForEach(concepts) { c in
                    NavigationLink(value: Route.concept(c)) {
                        VStack(alignment: .leading, spacing: Spacing.s2) {
                            RemoteImage(url: c.thumbURL, cornerRadius: Radius.card)
                                .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                            Text(c.title).font(AppFont.footnote).foregroundStyle(Color.ink).lineLimit(1)
                        }
                    }
                    .buttonStyle(PressScaleButtonStyle())
                }
            }
            .padding(.horizontal, Spacing.page)
        }
    }
}
