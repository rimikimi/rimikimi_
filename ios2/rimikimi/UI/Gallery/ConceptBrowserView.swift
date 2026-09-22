import SwiftUI

/// 카테고리 안의 사진들을 훑어보는 화면 — 네이티브 사진 앱의 "사진 하나 보기 + 아래 필름스트립".
///
/// 겉모습만이 아니라 **동작까지** 사진 앱과 같게 맞춘다(오너 지시 2026-09-22 "뒤에 코딩 붙은
/// 것까지"). 지금 들어와 있는 것:
///  · **아래로 끌어내리면** 화면이 따라 내려가며 작아지고 격자로 돌아간다(직접 구현 — 아래 주석).
///  · 큰 사진을 **핀치로 확대**하고 확대된 상태에서 끌어 옮길 수 있다. **두 번 탭**하면 확대/원래대로.
///    확대 중에는 좌우 넘김이 잠긴다(사진 앱과 같다).
///  · 아래 필름스트립을 **끌면 사진이 따라 바뀐다**(스크러빙). 큰 사진을 넘겨도 필름스트립이 따라온다.
///    두 방향 모두 `scrollPosition` 하나로 묶여 있어 한쪽만 도는 일이 없다.
/// 실제 "만들기"는 여기서 하지 않고 `ConceptOptionsView` 로 넘긴다 — 이 화면은 훑어보기 전용.
struct ConceptBrowserView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    var category: String
    var startID: String

    /// 지금 보고 있는 컨셉 id. 페이저와 필름스트립이 **같은 값**을 쓴다.
    /// ⚠️ `onAppear` 에서 넣으면 안 된다 — 필름스트립이 이미 첫 레이아웃을 끝낸 뒤라 선택된 칸이
    ///    가운데로 안 온다(첫 화면에서 엉뚱한 칸이 가운데 있었다). 처음부터 값을 들고 시작한다.
    @State private var currentID: String?
    /// 확대 중이면 페이저 스와이프를 잠근다.
    @State private var zoomedIn = false
    /// 아래로 끌어 닫는 중의 이동량.
    @State private var dragY: CGFloat = 0
    /// 필름스트립을 사용자가 스크롤하는 중인가(양방향 되먹임을 막는다).
    @State private var scrolling = false

    init(category: String, startID: String) {
        self.category = category
        self.startID = startID
        _currentID = State(initialValue: startID)
    }

    private var items: [Concept] { app.concepts.concepts(in: category) }
    private var current: Concept? { items.first { $0.id == currentID } }

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $currentID) {
                ForEach(items) { c in
                    ZoomableImage(isZoomed: $zoomedIn) {
                        // 화면 전체 폭에 깔리므로 400px 썸네일이 아니라 1200px 원본.
                        RemoteImage(url: c.largeURL, cornerRadius: 0, fallback: c.thumbURL)
                            .photoRatio()
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
        // 아래로 끌면 화면이 따라 내려가며 작아지고, 충분히 내리면 격자로 돌아간다(사진 앱과 같다).
        // ⚠️ 시스템 확대 전환(`.zoom`)에도 끌어 닫기가 딸려 있지만 이 화면은 가로 페이저가 제스처를
        //    먼저 가져가 실제로는 안 먹었다(오너 지적 2026-09-22) — 그래서 여기서 직접 구현한다.
        .offset(y: dragY)
        .scaleEffect(1 - dismissProgress * 0.14, anchor: .center)
        .background(Color.bg.opacity(1 - dismissProgress * 0.35).ignoresSafeArea())
        .animation(.interactiveSpring(response: 0.28, dampingFraction: 0.86), value: dragY)
        .simultaneousGesture(dismissDrag)
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
        .onChange(of: currentID) { old, _ in
            guard old != nil else { return }
            zoomedIn = false            // 사진이 바뀌면 확대는 풀린다(사진 앱과 같다)
        }
    }

    /// 아래로 끌어 닫기. 가로 페이저·필름스트립과 싸우지 않도록 **세로로 더 많이 움직였을 때만** 잡고,
    /// 사진을 확대한 상태에서는 아예 안 잡는다(그땐 끌기가 사진 이동이다).
    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 14)
            .onChanged { v in
                guard !zoomedIn, abs(v.translation.height) > abs(v.translation.width) * 1.4 else { return }
                // 위로는 거의 안 따라오게(고무줄) — 닫기는 아래 방향만이다.
                dragY = v.translation.height > 0 ? v.translation.height : v.translation.height * 0.2
            }
            .onEnded { v in
                guard dragY != 0 else { return }
                let far = dragY > 140
                let fast = v.predictedEndTranslation.height > 320
                if far || fast {
                    HapticPlayer.selection()
                    dismiss()
                } else {
                    dragY = 0
                }
            }
    }

    private var dismissProgress: CGFloat { min(1, max(0, dragY / 300)) }

    /// 필름스트립 — `scrollPosition` 으로 페이저와 **양방향**으로 묶인다. 끌면 스크러빙, 탭하면 점프.
    ///
    /// ⚠️ 스크러빙 중에는 큰 사진을 **애니메이션 없이** 갈아 끼운다(`scrubSelection`). 안 그러면
    /// 필름스트립을 한 번 끌 때 지나친 사진 수만큼 페이지 넘김 애니메이션이 줄줄이 걸려 늦게 따라온다
    /// (오너 지적 2026-09-22 "사진 따라붙는 방식 이상하고"). 사진 앱도 스크러빙 중엔 그냥 바뀐다.
    /// 필름스트립 — **진짜 스크롤**이다(관성·바운스 전부 시스템 것). 스크롤하는 동안 가운데 칸을
    /// 계속 따라가며 큰 사진을 바꾼다. 직접 만든 스크러버는 칸 단위로 끊겨서 버렸다
    /// (오너 지적 2026-09-22 "하단에 있는 슬라이드도 뚝뚝 끊기는데 부드럽게 넘어가야함").
    private var filmstrip: some View {
        GeometryReader { geo in
            let side = max(0, (geo.size.width - Self.stripWidth) / 2)
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    LazyHStack(spacing: Self.stripGap) {
                        ForEach(items) { c in
                            Button { jump(to: c.id) } label: {
                                // 미리보기는 전부 3:4 (오너 지시) — 필름스트립도 예외가 아니다.
                                RemoteImage(url: c.thumbURL, cornerRadius: Radius.button - 4)
                                    .photoRatio()
                                    .frame(width: Self.stripWidth)
                                    .overlay {
                                        RoundedRectangle(cornerRadius: Radius.button - 4, style: .continuous)
                                            .strokeBorder(c.id == currentID ? Color.accent : .clear, lineWidth: 2)
                                    }
                                    .opacity(c.id == currentID ? 1 : 0.55)
                            }
                            .buttonStyle(PressScaleButtonStyle())
                            .id(c.id)
                        }
                    }
                    .scrollTargetLayout()
                    // 양 끝 칸도 가운데까지 올 수 있게.
                    .padding(.horizontal, side)
                }
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
                // 스크롤 위치 → 가운데 칸. 손가락을 따라 **연속으로** 바뀐다.
                .onScrollGeometryChange(for: Int.self) { g in
                    Int((g.contentOffset.x / (Self.stripWidth + Self.stripGap)).rounded())
                } action: { _, idx in
                    guard scrolling, items.indices.contains(idx), items[idx].id != currentID else { return }
                    var t = Transaction(); t.disablesAnimations = true
                    withTransaction(t) { currentID = items[idx].id }
                }
                .onScrollPhaseChange { _, phase in scrolling = phase != .idle }
                .onAppear { proxy.scrollTo(startID, anchor: .center) }
                .onChange(of: currentID) { _, id in
                    // 큰 사진을 넘겨서 바뀐 경우에만 스트립을 옮긴다 — 스트립을 끌고 있을 땐 건드리지 않는다.
                    guard !scrolling, let id else { return }
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) { proxy.scrollTo(id, anchor: .center) }
                }
            }
        }
        .frame(height: Self.stripWidth / CardMetrics.aspect + 8)
    }

    private func jump(to id: String) {
        HapticPlayer.selection()
        currentID = id
    }

    private static let stripWidth: CGFloat = 52
    private static let stripGap: CGFloat = 8

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
            // ⚠️ 확대했을 때만 건다. 그냥 달아 두면 배율이 1이어도 이 제스처가 가로 끌기를 가져가
            //    **페이저 스와이프가 통째로 죽는다**(오너 지적 2026-09-22 "위에 있는 이미지 슬라이드는 왜 안 됨").
            .simultaneousGesture(
                DragGesture()
                    .onChanged { v in
                        offset = CGSize(width: lastOffset.width + v.translation.width,
                                        height: lastOffset.height + v.translation.height)
                    }
                    .onEnded { _ in lastOffset = offset },
                including: scale > 1 ? .all : .subviews
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
