import SwiftUI
import UIKit

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
            Tab("필터", systemImage: "film", value: .filter) {
                NavigationStack { FilterTabView() }
            }
            // 가운데 슬롯: 아이콘·라벨을 비워 두고(투명 이미지, 빈 문자열) 떠 있는 원만 보이게 한다.
            Tab(value: .camera) {
                Color.bg.ignoresSafeArea()
            } label: {
                Label { Text("") } icon: { Image(uiImage: UIImage.clearTabIcon) }
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
        // ⚠️ 탭바 배경을 강제하려 들지 말 것 (2026-09-16 에 한 번 헛수고했다).
        //    "다크 모드인데 탭바만 밝다" 는 버그가 아니다. Liquid Glass 는 **뒤에 있는 내용**의
        //    밝기를 가져온다 — 밝은 사진 줄 위에서는 밝게, 어두운 화면(프로필 등) 위에서는
        //    어둡게 보이는 게 정상이고, 사진 앱을 비롯한 애플 기본 앱이 똑같이 동작한다.
        //    아이콘·라벨은 양쪽 모두 다크 모드 색으로 제대로 나온다.
        //    `.toolbarColorScheme` / `.toolbarBackground` / `UITabBarAppearance` 는 이 떠 있는
        //    탭바에 아무 효과가 없다(불투명 단색까지 강제해 확인).
        // 안쪽 화면(푸시)에서는 탭바가 숨으므로 카메라 원도 함께 숨긴다 — 만들기 바 위에 겹치던 문제.
        .overlay(alignment: .bottom) {
            if app.galleryPath.isEmpty && app.myPhotosPath.isEmpty && app.profilePath.isEmpty {
                CameraTabButton(bottomPadding: cameraBottomPadding) { openCamera() }
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(Motion.exitCurve(), value: app.galleryPath.isEmpty && app.myPhotosPath.isEmpty && app.profilePath.isEmpty)
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
            let job = app.generation.pendingPresentationJob
            app.generation.pendingPresentationJob = nil
            app.generation.pendingPresentation = nil
            // ATT 트리거는 여기서 부르지 않는다 — 내비게이션이 아직 전환 중이라 앱이 `.active` 가
            // 아닌 순간일 수 있다(컴플라이언스 리뷰로 발견, `TrackingPrompt` 주석 참고). 실제 트리거는
            // `ResultView.onAppear`(화면이 진짜 보일 때)로 옮겼다 — 여기서는 광고 스킵 판단에만
            // 쓰는 "물어볼 차례인가"를 미리 읽어 둔다(이 읽기 자체는 플래그를 바꾸지 않아 안전).
            let attWillAsk = !TrackingPrompt.asked
            app.present(items, job: job)
            // 무료 사용자 → 생성 후 전면광고 1회 (1.x `src/ads.js` 규칙 그대로).
            // 단 ATT 팝업이 뜰 차례면(첫 결과) 이번 회는 건너뛴다 — 전면광고가 화면을 덮은 채
            // ATT 를 요청하면 iOS 가 조용히 무시한다(1.x `ads.js` 가 기록해 둔 사고, SPEC §3
            // "팝업 겹치기 금지"). 광고는 두 번째 생성부터 정상적으로 나간다.
            // ⚠️ 이 자리는 **복구 경로**(앱 재시작·복귀 뒤 갤러리에서 결과를 되찾는 길)도
            //    지나간다. 1.x 는 복구에는 광고를 띄우지 않았고 안드로이드도 안 띄운다 —
            //    양쪽을 맞춘다. 방금 생성이 끝나 결과가 뜬 경우에만 광고를 낸다.
            if !attWillAsk, app.generation.lastDoneWasLive { app.showInterstitialAfterGeneration() }
        }
        // 429(크레딧 부족) 실패 → 시트. 구매 뒤 같은 요청을 이어간다.
        .onChange(of: app.generation.failedTick) { _, _ in
            app.handleGenerationFailure()
        }
        // 완료 푸시 탭 → 결과 화면 직행(4주차).
        .onChange(of: app.push.pendingTapKind) { _, kind in
            guard let kind else { return }
            let galleryId = app.push.pendingGalleryId
            app.push.clearTapKind()
            if kind == "genDone" { app.openGalleryResult(galleryId: galleryId) }
        }
        .sheet(isPresented: $app.loginSheet) {
            LoginSheet(message: app.loginMessage)
                .presentationDetents([.medium, .large])
                .presentationCornerRadius(Radius.sheet)
        }
        .sheet(isPresented: $app.creditsSheet) {
            CreditsSheet()
                .presentationDetents([.large])
                .presentationCornerRadius(Radius.sheet)
        }
        // 제3자 AI 전송 고지 — 첫 "만들기" 때 1회만(계정/기기당). 미뤄둔 생성/채워맞춤은 시트가
        // **완전히 닫힌 뒤**(onDismiss)에 이어간다 — 닫히는 도중에 새 시트(크레딧 시트 등)를 열면
        // 경합해 조용히 무반응이 될 수 있었다(재검증으로 발견).
        .sheet(isPresented: $app.aiConsentSheet, onDismiss: { app.resumeAfterConsentDismissed() }) {
            AIConsentSheet(onAgree: { app.continueAfterConsent() }, onCancel: { app.cancelConsent() })
                .presentationDetents([.medium, .large])
                .presentationCornerRadius(Radius.sheet)
                .interactiveDismissDisabled()
        }
        // 아이폰 기본 카메라 — 애플이 만든 촬영 화면 그대로(포커스·줌·플래시 전부 동작).
        .fullScreenCover(isPresented: $app.showSystemCamera) {
            SystemCameraPicker(
                onPicked: { app.handleCameraShot($0) },
                onCancel: { app.showSystemCamera = false }
            )
            .ignoresSafeArea()
        }
        // 시스템 사진 선택창 — 필터를 고른 뒤 사진을 먼저 고른다.
        .sheet(isPresented: $app.showPhotoPicker) {
            PhotoPicker(
                onPicked: { app.handlePickedPhotos($0) },
                onCancel: { app.showPhotoPicker = false; app.photoPickPreset = nil }
            )
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $app.webTool) { tool in
            WebToolScreen(url: tool.url, title: tool.title, initialPayload: tool.initialPayload)
        }
        .toast($app.toast)
    }

    private func openCamera() {
        app.requireLogin(.camera)
    }

    /// 카메라 원의 `.padding(.bottom)`.
    /// ⚠️ **탭바 프레임을 재서 계산하지 말 것** (2026-09-16 build 91 사고).
    ///    `UITabBar` 를 찾아 `screenBottom - topY` 로 계산했더니 버튼이 화면 한가운데로 갔다.
    ///    이유 두 가지: ① 이 오버레이는 `.bottom` 정렬이라 padding 기준이 **안전영역 아래**인데
    ///    계산은 **화면 아래** 기준이었다(이중 계산) ② iOS 26 떠 있는 탭바는 찾은 `UITabBar`
    ///    뷰의 프레임이 실제 보이는 알약과 달라 `topY` 가 엉뚱하게 작게 나온다.
    ///    → 고정값으로 두고, 값은 **시뮬레이터 스크린샷에서 픽셀을 직접 재서** 맞춘다.
    private var cameraBottomPadding: CGFloat { TabBarMetrics.cameraFallbackBottom }
}

extension UIImage {
    /// 탭 아이템 자리를 차지하되 아무것도 그리지 않는 투명 아이콘.
    static let clearTabIcon: UIImage = {
        let size = CGSize(width: 28, height: 28)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in }
            .withRenderingMode(.alwaysOriginal)
    }()
}

/// 가운데 카메라 원 — 54pt, 잉크 배경. `bottomPadding` 은 `RootTabView` 가 실측한 탭바 프레임 기준으로
/// 매 프레임 계산해 넘긴다(결함 #2, 오너 지시) — 탭바 위에 살짝 겹쳐 떠 있는 모습을 기기 불문 유지.
struct CameraTabButton: View {
    var bottomPadding: CGFloat
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
        .padding(.bottom, bottomPadding)
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
        case .store: StoreView()
        case .invite: InviteView()
        }
    }
}
