import SwiftUI

/// 카테고리 안의 사진들을 훑어보는 화면 — 네이티브 사진 앱의 "사진 하나 보기 + 아래 필름스트립".
///
/// 겉모습만이 아니라 **동작까지** 사진 앱과 같게 맞춘다(오너 지시 2026-09-22 "뒤에 코딩 붙은
/// 것까지"). 지금 들어와 있는 것:
///  · 격자에서 누른 칸에서 확대돼 들어오고, **아래로 끌어내리면** 그 칸으로 되돌아간다
///    (`.navigationTransition(.zoom)` — 시스템 전환이라 곡선·되돌리기 전부 애플 것).
///  · 큰 사진을 **핀치로 확대**하고 확대된 상태에서 끌어 옮길 수 있다. **두 번 탭**하면 확대/원래대로.
///    확대 중에는 좌우 넘김이 잠긴다(사진 앱과 같다).
///  · 아래 필름스트립을 **끌면 사진이 따라 바뀐다**(스크러빙). 큰 사진을 넘겨도 필름스트립이 따라온다.
///    두 방향 모두 `scrollPosition` 하나로 묶여 있어 한쪽만 도는 일이 없다.
/// 실제 "만들기"는 여기서 하지 않고 `ConceptOptionsView` 로 넘긴다 — 이 화면은 훑어보기 전용.
struct ConceptBrowserView: View {
    @Environment(AppState.self) private var app
    @Environment(\.zoomNamespace) private var zoomNS
    var category: String
    var startID: String

    /// 지금 보고 있는 컨셉 id. 페이저와 필름스트립이 **같은 값**을 쓴다.
    @State private var currentID: String?
    /// 확대 중이면 페이저 스와이프를 잠근다.
    @State private var zoomedIn = false

    private var items: [Concept] { app.concepts.concepts(in: category) }
    private var current: Concept? { items.first { $0.id == currentID } }

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $currentID) {
                ForEach(items) { c in
                    ZoomableImage(isZoomed: $zoomedIn) {
                        // 화면 전체 폭에 깔리므로 400px 썸네일이 아니라 1200px 원본.
                        RemoteImage(url: c.largeURL, cornerRadius: 0, fallback: c.thumbURL)
                            .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                    }
                    .tag(Optional(c.id))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            // 확대 중에는 페이지 넘김을 막는다 — 사진 앱도 확대 상태에서는 끌면 사진이 움직인다.
            .scrollDisabled(zoomedIn)

            if let current {
                Text(current.title)
                    .font(AppFont.headline)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .padding(.top, Spacing.s3)
                    .padding(.horizontal, Spacing.page)
            }

            filmstrip
                .padding(.vertical, Spacing.s3)

            if let current {
                NavigationLink(value: Route.concept(current)) {
                    Text("이 컨셉으로 만들기")
                }
                .buttonStyle(PrimaryButtonStyle(isDisabled: false))
                .padding(.horizontal, Spacing.page)
                .padding(.bottom, Spacing.s4)
            }
        }
        .background(Color.bg)
        .inlineTitle(category)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let current {
                ToolbarItem(placement: .topBarTrailing) {
                    FavoriteToolbarButton(isOn: app.favorites.isFavorite(concept: current.id)) {
                        app.favorites.toggle(concept: current.id)
                    }
                }
            }
        }
        // 지금 보고 있는 사진으로 되돌아가게 — 처음 누른 칸이 아니라(사진 앱과 같다).
        .zoomDestination("photo:" + (currentID ?? startID), in: zoomNS)
        .onAppear { if currentID == nil { currentID = startID } }
        .onChange(of: currentID) { old, _ in
            guard old != nil else { return }
            zoomedIn = false            // 사진이 바뀌면 확대는 풀린다(사진 앱과 같다)
            HapticPlayer.selection()
        }
    }

    /// 필름스트립 — `scrollPosition` 으로 페이저와 **양방향**으로 묶인다. 끌면 스크러빙, 탭하면 점프.
    private var filmstrip: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: Spacing.s2) {
                ForEach(items) { c in
                    Button { currentID = c.id } label: {
                        RemoteImage(url: c.thumbURL, cornerRadius: Radius.button - 4)
                            .frame(width: 64, height: 64)
                            .overlay {
                                RoundedRectangle(cornerRadius: Radius.button - 4, style: .continuous)
                                    .strokeBorder(c.id == currentID ? Color.accent : .clear, lineWidth: 2)
                            }
                            .scaleEffect(c.id == currentID ? 1 : 0.88)
                            .animation(.spring(response: 0.3, dampingFraction: 0.82), value: c.id == currentID)
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .id(c.id)
                }
            }
            .scrollTargetLayout()
            // 양 끝 칸도 가운데까지 올 수 있게 — 이 여백이 없으면 첫/마지막 사진에서 스크러빙이 막힌다.
            .safeAreaPadding(.horizontal, (UIScreen.main.bounds.width - 64) / 2)
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $currentID, anchor: .center)
        .frame(height: 72)
    }
}

/// 핀치·두 번 탭으로 확대되고, 확대된 상태에서 끌어 옮길 수 있는 사진(사진 앱과 같은 동작).
/// 확대 중인지를 바깥에 알려 페이저 스와이프를 잠그게 한다.
struct ZoomableImage<Content: View>: View {
    @Binding var isZoomed: Bool
    @ViewBuilder var content: () -> Content

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    private static var maxScale: CGFloat { 4 }

    var body: some View {
        content()
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnifyGesture()
                    .onChanged { v in
                        scale = min(Self.maxScale, max(1, lastScale * v.magnification))
                    }
                    .onEnded { _ in
                        lastScale = scale
                        if scale <= 1.02 { reset() } else { isZoomed = true }
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { v in
                        guard scale > 1 else { return }
                        offset = CGSize(width: lastOffset.width + v.translation.width,
                                        height: lastOffset.height + v.translation.height)
                    }
                    .onEnded { _ in lastOffset = offset }
            )
            .onTapGesture(count: 2) {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    if scale > 1 { reset() } else { scale = 2.5; lastScale = 2.5; isZoomed = true }
                }
                HapticPlayer.selection()
            }
            .onChange(of: isZoomed) { _, on in
                if !on, scale > 1 { withAnimation(.easeOut(duration: 0.2)) { reset() } }
            }
            .clipped()
    }

    private func reset() {
        scale = 1; lastScale = 1
        offset = .zero; lastOffset = .zero
        isZoomed = false
    }
}
