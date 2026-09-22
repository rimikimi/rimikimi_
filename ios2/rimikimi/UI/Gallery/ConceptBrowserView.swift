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
    /// 필름스트립이 가운데 두고 있는 칸. 큰 사진(`currentID`)과 **서로** 따라간다.
    /// ⚠️ 처음부터 값을 들고 시작해야 한다 — `scrollPosition` 은 첫 레이아웃 때 이 값으로 자리를
    ///    잡는다. `onAppear` 에서 넣으면 그 시점엔 이미 0 에 자리를 잡은 뒤라 안 움직인다(실측).
    @State private var stripID: String?

    init(category: String, startID: String) {
        self.category = category
        self.startID = startID
        _currentID = State(initialValue: startID)
        _stripID = State(initialValue: startID)
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

    /// 필름스트립 — 진짜 스크롤(관성·바운스 전부 시스템 것). 가운데 칸이 곧 선택이고,
    /// 큰 사진과 **양방향**으로 물려 있다. 스크롤 좌표를 직접 계산하던 방식은 위아래가 따로 놀아서
    /// 버렸다(오너 지적 2026-09-22 "싱크랑 위치 하나도 안 맞음") — `scrollPosition` 하나로 맡긴다.
    private var filmstrip: some View {
        GeometryReader { geo in
            let side = max(0, (geo.size.width - Self.stripWidth) / 2)
            ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                // ⚠️ `LazyHStack` 이면 안 된다. 게으른 스택은 화면 근처 칸만 만들어 두므로,
                //    멀리 있는 칸으로는 `scrollPosition` 이 갈 수가 없다 — 있는 데까지만 가서 멈춘다.
                //    선택한 사진이 **맨 오른쪽에 붙어 있던 진짜 원인**이다(오너 지적 2026-09-22
                //    "선택한 이미지가 왜 제일 오른쪽에 가있음"). 52pt 썸네일 몇십 장은 한꺼번에
                //    만들어도 부담이 없고, 격자에서 이미 캐시돼 있다.
                HStack(spacing: Self.stripGap) {
                    ForEach(items) { c in
                        stripCell(c)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollIndicators(.hidden)
            // 양 끝 칸도 가운데까지 올 수 있게.
            .contentMargins(.horizontal, side, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $stripID, anchor: .center)
            // 스트립을 굴리면 큰 사진이 따라온다(애니메이션 없이 — 여러 장을 지나갈 때 끊기지 않게).
            .onChange(of: stripID) { _, id in
                guard let id, id != currentID else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { currentID = id }
            }
            // 큰 사진을 넘기면 스트립이 따라온다 — 이쪽은 부드럽게(안 그러면 툭 튄다).
            .onChange(of: currentID) { _, id in
                guard let id, id != stripID else { return }
                withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
            // ⚠️ 첫 자리잡기는 **반드시 명령형**이어야 한다. `scrollPosition` 바인딩에 처음부터 값을
            //    넣어 두는 것만으로는 안 움직였다(실측 2회) — 화면이 처음 그려지는 순간엔 컨셉 목록이
            //    아직 비어 있어 옮겨 갈 칸 자체가 없고, 목록이 도착해도 바인딩 값은 그대로라 아무 일도
            //    일어나지 않는다. 그래서 **칸이 생긴 뒤** 직접 옮긴다.
            .onChange(of: items.count) { _, n in
                guard n > 0 else { return }
                DispatchQueue.main.async { proxy.scrollTo(startID, anchor: .center) }
            }
            .onAppear {
                guard !items.isEmpty else { return }   // 목록이 이미 있으면 여기서 끝낸다
                DispatchQueue.main.async { proxy.scrollTo(startID, anchor: .center) }
            }
            }
        }
        .frame(height: Self.stripWidth / CardMetrics.aspect + 8)
    }

    /// 필름스트립 칸 하나. (한 식에 다 쓰면 컴파일러가 타입 추론을 포기한다 — 빌드로 확인.)
    @ViewBuilder
    private func stripCell(_ c: Concept) -> some View {
        let selected = c.id == currentID
        Button { jump(to: c.id) } label: {
            // 미리보기는 전부 3:4 (오너 지시) — 필름스트립도 예외가 아니다.
            RemoteImage(url: c.thumbURL, cornerRadius: Radius.button - 4)
                .photoRatio()
                .frame(width: Self.stripWidth)
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.button - 4, style: .continuous)
                        .strokeBorder(selected ? Color.accent : Color.clear, lineWidth: 2)
                }
            // 안 고른 칸을 흐리게 하지 않는다 — 사진 앱도 안 그러고, 반투명은 이 앱에서
            // 이미 한 번 오해를 샀다(테두리만으로 충분히 구분된다).
        }
        .buttonStyle(PressScaleButtonStyle())
        .id(c.id)
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
