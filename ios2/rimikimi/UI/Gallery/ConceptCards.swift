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

/// 홈의 "앨범" 타일 — 표지 1장(정방형) + 이름 + 장수. 탭 → 그 카테고리의 빽빽한 그리드(`DensePhotoGrid`).
struct AlbumGridTile: View {
    var tile: ConceptStore.AlbumTile

    var body: some View {
        NavigationLink(value: Route.category(tile.name)) {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                RemoteImage(url: tile.coverURL, cornerRadius: Radius.card)
                    .aspectRatio(1, contentMode: .fit)
                Text(tile.name).font(AppFont.cardTitle).foregroundStyle(Color.ink).lineLimit(1)
                Text("\(tile.count)장").font(AppFont.footnote).foregroundStyle(Color.ink3)
            }
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}

/// 두 열 앨범 그리드 — 홈에서 "추천"·"새로 나왔어요"를 뺀 나머지 카테고리(네이티브 사진 앱
/// "앨범" 탭 참고, 오너 지시 2026-09-19).
struct AlbumsGrid: View {
    var tiles: [ConceptStore.AlbumTile]
    private let columns = [GridItem(.flexible(), spacing: CardMetrics.railGap), GridItem(.flexible(), spacing: CardMetrics.railGap)]

    var body: some View {
        if !tiles.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("카테고리").font(AppFont.sectionTitle).tracking(Tracking.sectionTitle)
                    .padding(.horizontal, Spacing.page)
                    .padding(.top, Spacing.s1)
                    .padding(.bottom, Spacing.s3 - 2)
                    .accessibilityAddTraits(.isHeader)
                LazyVGrid(columns: columns, spacing: Spacing.s4) {
                    ForEach(tiles) { AlbumGridTile(tile: $0) }
                }
                .padding(.horizontal, Spacing.page)
            }
        }
    }
}

/// 빽빽한 정방형 그리드 — 카테고리 화면(네이티브 사진 앱 라이브러리 그리드 참고, 오너 지시
/// 2026-09-19). 카드 크롬·캡션 없음, 간격 2pt. 핀치로 3열↔5열(두 단계만 — 오너 지시로 3단계
/// 안 함). `MagnifyGesture`(iOS 17+, SwiftUI 정식 API — 네이티브 핀치 인식 자체는 이미 있고
/// "그 값을 열 수 전환에 매핑"만 직접 구현한 것) 로 손을 뗄 때 방향만 본다: 오므렸으면(축소)
/// 더 촘촘하게(5열), 벌렸으면 더 크게(3열). 탭 → 필름스트립 브라우저(`Route.browse`).
struct DensePhotoGrid: View {
    var concepts: [Concept]
    var category: String
    @State private var wideColumns = false  // false = 3열(큼), true = 5열(촘촘)

    private var columnCount: Int { wideColumns ? 5 : 3 }
    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 2), count: columnCount)
    }

    var body: some View {
        if concepts.isEmpty {
            EmptyState(message: "검색 결과가 없어요")
        } else {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(concepts) { c in
                    NavigationLink(value: Route.browse(category: category, startID: c.id)) {
                        RemoteImage(url: c.thumbURL, cornerRadius: 0)
                            .aspectRatio(1, contentMode: .fit)
                    }
                    .buttonStyle(.plain)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.86), value: columnCount)
            .gesture(
                MagnifyGesture()
                    .onEnded { value in
                        let shouldNarrow = value.magnification < 1  // 오므림 = 축소 = 더 촘촘히(5열)
                        guard shouldNarrow != wideColumns else { return }
                        wideColumns = shouldNarrow
                        HapticPlayer.selection()
                    }
            )
        }
    }
}
