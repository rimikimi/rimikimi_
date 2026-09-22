import SwiftUI

/// 카테고리 안의 사진들을 훑어보는 화면 — 네이티브 사진 앱의 "사진 하나 보기 + 아래 필름스트립"
/// 참고(오너 지시 2026-09-19). `DensePhotoGrid`에서 사진 하나를 탭하면 여기로 온다. 큰 사진은
/// 좌우 스와이프로, 아래 필름스트립은 스와이프도 탭도 되고 서로 선택이 동기화된다. 실제 "만들기"는
/// 여기서 하지 않고 기존 `ConceptOptionsView`로 넘긴다 — 이 화면은 훑어보기 전용.
struct ConceptBrowserView: View {
    @Environment(AppState.self) private var app
    var category: String
    var startID: String

    @State private var index: Int = 0

    private var items: [Concept] { app.concepts.concepts(in: category) }
    private var current: Concept? { items.indices.contains(index) ? items[index] : nil }

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $index) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, c in
                    // 화면 전체 폭에 깔리므로 400px 썸네일이 아니라 1200px 원본(오너 지적 2026-09-22).
                    RemoteImage(url: c.largeURL, cornerRadius: 0, fallback: c.thumbURL)
                        .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                        .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

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
        .onAppear {
            if let i = items.firstIndex(where: { $0.id == startID }) { index = i }
        }
    }

    private var filmstrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: Spacing.s2) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { i, c in
                        Button {
                            HapticPlayer.selection()
                            index = i
                        } label: {
                            RemoteImage(url: c.thumbURL, cornerRadius: Radius.button - 4)
                                .frame(width: 64, height: 64)
                                .overlay {
                                    RoundedRectangle(cornerRadius: Radius.button - 4, style: .continuous)
                                        .strokeBorder(i == index ? Color.accent : .clear, lineWidth: 2)
                                }
                        }
                        .buttonStyle(PressScaleButtonStyle())
                        .id(i)
                    }
                }
                .padding(.horizontal, Spacing.page)
            }
            .scrollIndicators(.hidden)
            .onChange(of: index) { _, new in
                withAnimation { proxy.scrollTo(new, anchor: .center) }
            }
        }
    }
}
