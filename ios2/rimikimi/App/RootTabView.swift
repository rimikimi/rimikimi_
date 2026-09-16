import SwiftUI

/// `v2/SPEC.md` §2 — 탭 5슬롯: 갤러리 · 필터 · ⦿카메라(가운데, 떠 있음) · 내 사진 · 프로필.
/// iOS 26 Liquid Glass 탭바 + 스크롤 시 최소화. 가운데 슬롯은 탭이 아니라 **동작**(카메라 열기)이라
/// 선택되면 이전 탭으로 되돌리고 카메라를 연다. 원 버튼은 탭바 위에 겹쳐 그린다.
struct RootTabView: View {
    @Environment(AppState.self) private var app
    @State private var lastTab: TabID = .gallery

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.tab) {
            Tab("갤러리", systemImage: "square.grid.2x2", value: .gallery) {
                NavigationStack(path: $app.galleryPath) {
                    GalleryHomeView()
                        .navigationDestination(for: Route.self) { RouteDestination(route: $0) }
                }
            }
            Tab("필터", systemImage: "camera.filters", value: .filter) {
                NavigationStack { FilterTabView() }
            }
            Tab("", systemImage: "camera", value: .camera) {
                Color.bg.ignoresSafeArea()
            }
            Tab("내 사진", systemImage: "photo.on.rectangle", value: .myPhotos) {
                NavigationStack(path: $app.myPhotosPath) {
                    MyPhotosView()
                        .navigationDestination(for: Route.self) { RouteDestination(route: $0) }
                }
            }
            Tab("프로필", systemImage: "person.crop.circle", value: .profile) {
                NavigationStack(path: $app.profilePath) {
                    ProfileView()
                        .navigationDestination(for: Route.self) { RouteDestination(route: $0) }
                }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tint(Color.accent)
        .overlay(alignment: .bottom) { CameraTabButton { openCamera() } }
        .onChange(of: app.tab) { old, new in
            if new == .camera {
                app.tab = old == .camera ? lastTab : old
                openCamera()
            } else {
                lastTab = new
            }
        }
        // 생성 완료 → 결과 화면 1회 자동 표시.
        .onChange(of: app.generation.pendingPresentation?.map(\.id)) { _, ids in
            guard ids != nil, let items = app.generation.pendingPresentation else { return }
            app.generation.pendingPresentation = nil
            app.present(items, job: app.generation.job)
        }
        .sheet(isPresented: $app.loginSheet) {
            LoginSheet(message: app.loginMessage)
                .presentationDetents([.medium, .large])
                .presentationCornerRadius(Radius.sheet)
        }
        .sheet(isPresented: $app.creditsSheet) {
            CreditsShortSheet()
                .presentationDetents([.medium])
                .presentationCornerRadius(Radius.sheet)
        }
        .fullScreenCover(item: $app.webTool) { tool in
            WebToolScreen(url: tool.url, title: tool.title)
        }
        .toast($app.toast)
    }

    private func openCamera() {
        app.requireLogin(.camera)
    }
}

/// 가운데 카메라 원 — 54pt, 잉크 배경, 탭바 위로 14pt 띄움. 탭바가 스크롤로 최소화돼도 원은 남는다.
struct CameraTabButton: View {
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "camera.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Color.onInk)
                .frame(width: TabBarMetrics.cameraSize, height: TabBarMetrics.cameraSize)
                .background(Color.ink, in: Circle())
                .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.94))
        .accessibilityLabel("카메라")
        .padding(.bottom, TabBarMetrics.bottom + TabBarMetrics.cameraRaise)
    }
}

/// 한 곳에서 모든 스택의 목적지를 만든다.
struct RouteDestination: View {
    var route: Route
    var body: some View {
        switch route {
        case .concept(let c): ConceptOptionsView(concept: c)
        case .category(let name): CategoryListView(name: name)
        case .result(let payload): ResultView(payload: payload)
        }
    }
}
