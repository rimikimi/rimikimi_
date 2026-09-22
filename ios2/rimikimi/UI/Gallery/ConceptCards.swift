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
                    .photoRatio()
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
                    .photoRatio()
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
    /// 캡처·검증용 — 5열 상태로 바로 띄운다(시뮬레이터엔 핀치가 없다).
    var startWide: Bool = false
    @State private var wideColumns = false  // false = 3열(큼), true = 5열(촘촘)
    /// 핀치하는 동안엔 셀을 못 누르게 한다 — 손을 뗀 지점이 탭으로 잡혀 엉뚱한 사진이 열렸다
    /// (오너 지적 2026-09-22 "마지막 손가락 지점을 터치로 인식하는거 같음").
    @State private var pinching = false
    /// 잠금 해제 예약. 새 핀치가 시작되면 이전 예약을 **취소**한다 — 안 그러면 앞 핀치가 걸어 둔
    /// 3초 안전장치가 다음 핀치 도중에 터져서 잠금이 풀린다.
    @State private var unlock: DispatchWorkItem?
    /// 문턱을 넘기 전, 손가락을 따라 아주 조금 움직이는 몫.
    @State private var liveScale: CGFloat = 1
    /// 사라지는 쪽 격자의 열 수. 전환하는 동안만 값이 있고, 위에 겹쳐서 흐려진다.
    @State private var fadingColumns: Int?
    @State private var fadeOpacity: CGFloat = 0

    private var columnCount: Int { wideColumns ? 5 : 3 }
    /// 타일 사이 간격과 화면 양옆 여백. 사진 앱은 끝까지 꽉 채우지만 우리 격자는 그러면 답답하다
    /// (오너 지적 2026-09-22 "여백 안 주냐").
    private static let gap: CGFloat = 4
    /// 5열로 좁히면 화면에 칸이 세 배 가까이 늘어난다. 미리 받아 두지 않으면 그 칸들이 잠깐
    /// 빈 회색으로 있다가 하나씩 뜬다(녹화해서 확인 — 약 0.1초). 썸네일은 장당 수십 KB라
    /// 한 화면 분량을 미리 받아 두는 편이 낫다.
    private func prefetch() {
        for c in concepts.prefix(60) {
            let url = c.thumbURL
            guard ImageLoader.shared.cached(url) == nil else { continue }
            Task { _ = await ImageLoader.shared.load(url) }
        }
    }

    /// 열 수를 바꾼다 — **배치는 한 프레임에 갈아끼우고, 옛 화면을 위에 겹쳐 흐린다.**
    ///
    /// 네이티브 사진 앱이 정확히 이렇게 한다. 오너가 전환 순간을 직접 캡처해 왔는데(2026-09-22),
    /// 타일 자리는 **이미 최종 배열**이고 칸 안에서 옛 사진과 새 사진이 겹쳐 있었다. 자리를 옮기는
    /// 게 아니라 두 화면을 **크로스페이드** 하는 것이다.
    ///
    /// 자리를 진짜로 옮기는 것(칸마다 제 자리로 보간)도 만들어 봤다 — `Layout` 까지 짰다. 결과는
    /// 계단처럼 흩어졌다. 칸마다 이동 거리가 제각각이라(맨 아래 칸은 몇 줄씩 올라온다) 중간 프레임이
    /// 성기게 벌어진다. 사진 앱이 이 방식을 안 쓰는 이유다. 되돌렸다.
    private func step(to next: Bool) {
        // ⚠️ 두 장을 **같은 프레임에** 바꾸면 안 된다. 그 순간 위아래 격자가 둘 다 갓 만들어진
        //    상태라 어느 쪽도 아직 안 그려져서, 한 프레임 동안 배경만 보인다(녹화해서 확인 —
        //    화면이 허옇게 뜬다). 그래서 **한 프레임 나눠서** 한다.
        var t = Transaction(); t.disablesAnimations = true
        // 프레임 0 — 지금 배치 그대로 한 장을 위에 더 얹는다(화면은 그대로 보인다).
        withTransaction(t) {
            fadingColumns = columnCount
            fadeOpacity = 1
            liveScale = 1
        }
        HapticPlayer.selection()
        DispatchQueue.main.async {
            // 프레임 1 — 위 장이 다 그려졌으니, 그 **뒤에서** 배치를 갈아끼운다. 안 보인다.
            withTransaction(t) { wideColumns = next }
            // 그리고 위 장을 흐린다 = 새 배치가 비쳐 나온다. 네이티브 사진 앱과 같은 겹침.
            withAnimation(.easeInOut(duration: 0.24)) { fadeOpacity = 0 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                if fadeOpacity == 0 { fadingColumns = nil }
            }
        }
    }

    private func columns(_ n: Int) -> [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: Self.gap), count: n)
    }

    /// 격자 한 장. 열 수만 다르게 해서 전환 중엔 두 장을 겹친다.
    @ViewBuilder
    private func grid(_ n: Int) -> some View {
        LazyVGrid(columns: columns(n), spacing: Self.gap) {
            ForEach(concepts) { c in
                // ⚠️ `NavigationLink` 를 쓰면 안 된다. 손가락이 **닿는 순간** 링크가 그 터치를
                //    가져가 버려서, 뒤늦게 핀치가 시작돼도 이미 늦다 — 손을 뗄 때 그대로 탭으로
                //    들어가 엉뚱한 사진이 열린다(오너 지적 2026-09-22 "마지막 손가락 포지션을
                //    터치한 걸로 인식"). `allowsHitTesting` 을 도중에 꺼도 소용없다. 적중 판정은
                //    닿는 순간에 이미 끝났기 때문이다. 그래서 **누를 때가 아니라 동작할 때**
                //    막는다 — 아래 `guard` 는 손을 뗀 시점에 돈다.
                Button {
                    guard !pinching else { return }
                    app.pushRoute(.browse(category: category, startID: c.id))
                } label: {
                    // ⚠️ 미리보기는 무조건 3:4 (오너 지시 2026-09-22). 정방형이면 인물이 잘린다.
                    RemoteImage(url: c.thumbURL, cornerRadius: 0)
                        .photoRatio()
                        .overlay { if app.favorites.hasGenerated(c.id) { GeneratedScrim() } }
                        .overlay(alignment: .topTrailing) {
                            if app.favorites.isFavorite(concept: c.id) {
                                FavoriteBadge(size: n == 5 ? 16 : 20).padding(4)
                            }
                        }
                        // 썸네일은 전부 둥글게(오너 지시 2026-09-22 "다 라운드 적용 해").
                        // 겹쳐 놓은 그라데이션·별까지 같이 깎이도록 **맨 바깥에서** 자른다.
                        .clipShape(RoundedRectangle(cornerRadius: n == 5 ? 6 : Radius.thumb,
                                                    style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func scheduleUnlock(after seconds: Double) {
        unlock?.cancel()
        let item = DispatchWorkItem { pinching = false }
        unlock = item
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    }

    var body: some View {
        if concepts.isEmpty {
            EmptyState(message: "검색 결과가 없어요")
        } else {
            grid(columnCount)
                // 전환하는 동안만, 옛 배치를 그대로 위에 얹어 흐린다. 자리를 차지하지 않게
                // `overlay` 로 얹는다 — 아래 새 배치가 스크롤 높이를 정한다.
                .overlay(alignment: .top) {
                    if let fadingColumns {
                        grid(fadingColumns)
                            // ⚠️ `overlay` 는 아래 격자의 크기를 그대로 물려받는다. 그런데 아래가
                            //    새 배치로 바뀌면서 높이가 확 줄면, 이 사라질 장까지 덩달아 다시
                            //    배치돼서 한 프레임 허옇게 뜬다(녹화해서 확인). 제 높이를 쓰게 해
                            //    아래 크기 변화와 끊어 놓는다.
                            .fixedSize(horizontal: false, vertical: true)
                            .opacity(fadeOpacity)
                            .allowsHitTesting(false)
                    }
                }
            // 핀치는 **열 수만** 바꾼다 — 3열 ↔ 5열. 페이지를 같이 확대/축소하지 않는다
            // (2026-09-22 오너 지적: 화면 전체가 작아지는 건 시스템 확대전환의 "핀치로 닫기"였다.
            //  그래서 이 화면에서는 확대전환을 쓰지 않는다 — 아래 `zoomSource` 를 뗀 이유).
            // 문턱을 넘기 전 "핀치가 먹고 있다"는 느낌만 준다.
            .scaleEffect(liveScale, anchor: .center)
            .padding(.horizontal, Spacing.page)
            .padding(.top, Spacing.s2)
            .onAppear {
                if startWide { wideColumns = true }
                prefetch()
            }
            // 캡처·검증용 — 시뮬레이터엔 핀치가 없어서 열 전환을 눈으로 볼 방법이 이것뿐이다.
            // 실제 핀치와 **같은 경로**(`step(to:)`)를 타야 녹화한 게 의미가 있다.
            .onChange(of: app.devWideColumns) { _, w in if w != wideColumns { step(to: w) } }
            .gesture(PinchColumnsGesture(
                onBegan: {
                    pinching = true
                    scheduleUnlock(after: 3)   // 종료 콜백을 놓쳐도 잠금이 영원히 남지 않게
                },
                // 문턱을 넘기 전에도 손가락을 따라 조금 움직인다 — 핀치가 먹고 있다는 느낌.
                onProgress: { s in liveScale = 1 + (s - 1) * 0.1 },
                onStep: { zoomIn in
                    let next = !zoomIn  // 벌림 = 확대 = 3열(wideColumns false), 오므림 = 5열
                    guard next != wideColumns else {
                        withAnimation(.snappy(duration: 0.2)) { liveScale = 1 }
                        return
                    }
                    step(to: next)
                },
                onEnd: {
                    withAnimation(.snappy(duration: 0.2)) { liveScale = 1 }
                    // 손을 뗀 직후 한 박자 뒤에 푼다 — 떼는 순간의 잔여 터치가 탭으로 새지 않게.
                    scheduleUnlock(after: 0.25)
                }
            ))
        }
    }
}
