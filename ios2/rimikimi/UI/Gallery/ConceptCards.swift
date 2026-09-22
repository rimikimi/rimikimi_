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
    @Environment(AppState.self) private var app
    @Environment(\.zoomNamespace) private var zoomNS
    var concept: Concept

    var body: some View {
        NavigationLink(value: Route.concept(concept)) {
            VStack(alignment: .leading, spacing: 0) {
                RemoteImage(url: concept.thumbURL, cornerRadius: 0)
                    .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                    .overlay { if app.favorites.hasGenerated(concept.id) { GeneratedScrim() } }
                    .overlay(alignment: .topTrailing) {
                        if app.favorites.isFavorite(concept: concept.id) {
                            FavoriteBadge().padding(Spacing.s2)
                        }
                    }
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
        .zoomSource("concept:" + concept.id, in: zoomNS)
    }
}

/// 홈의 "앨범" 타일 — 표지 1장 + 이름 + 장수. 탭 → 그 카테고리의 빽빽한 그리드(`DensePhotoGrid`).
/// ⚠️ 미리보기는 **무조건 3:4** 다(오너 지시 2026-09-22). 정방형으로 자르면 인물 사진이 잘리고
///    줄마다 높이가 들쭉날쭉해진다.
struct AlbumGridTile: View {
    @Environment(AppState.self) private var app
    @Environment(\.zoomNamespace) private var zoomNS
    var tile: ConceptStore.AlbumTile

    var body: some View {
        NavigationLink(value: Route.category(tile.name)) {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                RemoteImage(url: tile.coverURL, cornerRadius: Radius.card, fallback: tile.coverFallbackURL)
                    .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                    .overlay(alignment: .topTrailing) {
                        if app.favorites.isFavorite(category: tile.name) {
                            FavoriteBadge().padding(Spacing.s2)
                        }
                    }
                Text(tile.name).font(AppFont.cardTitle).foregroundStyle(Color.ink).lineLimit(1)
                Text("\(tile.count)장").font(AppFont.footnote).foregroundStyle(Color.ink3)
            }
        }
        .buttonStyle(PressScaleButtonStyle())
        .zoomSource("album:" + tile.name, in: zoomNS)
    }
}

/// 상단바의 별 버튼 — 카테고리·컨셉 즐겨찾기 공용(오너 지시 2026-09-22 "우측 상단에 별표").
struct FavoriteToolbarButton: View {
    var isOn: Bool
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: isOn ? "star.fill" : "star")
                .foregroundStyle(isOn ? Color.favoriteStar : Color.ink)
                .contentTransition(.symbolEffect(.replace))
        }
        .accessibilityLabel(isOn ? "즐겨찾기 해제" : "즐겨찾기")
    }
}

/// 즐겨찾기 표시 — 사진 위에 얹으므로 어두운 원 안의 노란 별(사진 밝기와 무관하게 보이게).
struct FavoriteBadge: View {
    var size: CGFloat = 22
    var body: some View {
        Image(systemName: "star.fill")
            .font(.system(size: size * 0.52, weight: .semibold))
            .foregroundStyle(Color.favoriteStar)
            .frame(width: size, height: size)
            .background(.black.opacity(0.35), in: Circle())
            .accessibilityLabel("즐겨찾기")
    }
}

/// "이미 만들어 본 컨셉" 표시 — 아래쪽 반투명 그라데이션 + 체크(오너 지시 2026-09-22:
/// "이미 생성했던걸 사용자가 한 눈에 알 수 있도록"). 사진을 가리지 않을 만큼만 덮는다.
struct GeneratedScrim: View {
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom)
            HStack(spacing: 3) {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 11, weight: .bold))
                Text("만든 컨셉").font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 6).padding(.vertical, 5)
        }
        .allowsHitTesting(false)
        .accessibilityLabel("이미 만든 컨셉")
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
/// 안 함): 오므리면(축소) 더 촘촘하게(5열), 벌리면 더 크게(3열). 핀치 인식은 `PinchColumnsGesture`
/// (UIKit 핀치 + 동시 인식) — `MagnifyGesture` 는 손가락 조합에 따라 스크롤에 먹혔다(그 파일 주석).
/// 탭 → 필름스트립 브라우저(`Route.browse`).
struct DensePhotoGrid: View {
    @Environment(AppState.self) private var app
    @Environment(\.zoomNamespace) private var zoomNS
    var concepts: [Concept]
    var category: String
    @State private var wideColumns = false  // false = 3열(큼), true = 5열(촘촘)
    /// 핀치하는 **동안** 따라 움직이는 배율(사진 앱처럼 손가락을 따라오게).
    @State private var liveScale: CGFloat = 1

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
                        // ⚠️ 미리보기는 무조건 3:4 (오너 지시 2026-09-22). 정방형이면 인물이 잘린다.
                        RemoteImage(url: c.thumbURL, cornerRadius: 0)
                            .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                            .overlay { if app.favorites.hasGenerated(c.id) { GeneratedScrim() } }
                            .overlay(alignment: .topTrailing) {
                                if app.favorites.isFavorite(concept: c.id) {
                                    FavoriteBadge(size: wideColumns ? 16 : 20).padding(4)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .zoomSource("photo:" + c.id, in: zoomNS)
                }
            }
            // 손가락을 벌리는 **동안** 격자가 같이 커진다(사진 앱과 같다). 문턱을 넘으면 열 수가
            // 바뀌고 배율은 1 로 되돌아가, 확대가 열 수 변화로 "넘어가는" 느낌이 난다.
            .scaleEffect(liveScale, anchor: .top)
            .animation(.spring(response: 0.35, dampingFraction: 0.86), value: columnCount)
            .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.9), value: liveScale)
            .gesture(PinchColumnsGesture(
                onProgress: { magnification in
                    // 바뀔 수 있는 방향으로만 늘어난다 — 3열에서 더 벌려도 커지기만 하면 거짓말이 된다.
                    let canGrow = wideColumns, canShrink = !wideColumns
                    if magnification > 1 { liveScale = canGrow ? min(1.18, magnification) : 1 + (min(1.1, magnification) - 1) * 0.25 }
                    else { liveScale = canShrink ? max(0.88, magnification) : 1 - (1 - max(0.92, magnification)) * 0.25 }
                },
                onStep: { zoomIn in
                    liveScale = 1
                    let next = !zoomIn  // 벌림 = 확대 = 3열(wideColumns false), 오므림 = 5열
                    guard next != wideColumns else { return }
                    wideColumns = next
                    HapticPlayer.selection()
                },
                onEnd: { liveScale = 1 }
            ))
        }
    }
}
