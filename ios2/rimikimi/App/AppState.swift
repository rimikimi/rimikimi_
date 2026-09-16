import SwiftUI
import Observation

/// 탭 밖에서 공유되는 화면 상태 — 탭 선택, 스택 경로, 로그인 시트, 하던 동작(pending) 재개.
enum TabID: Hashable { case gallery, filter, camera, myPhotos, profile }

/// 각 탭 스택의 목적지.
enum Route: Hashable {
    case concept(Concept)
    case category(String)
    case result(ResultPayload)
}

struct ResultPayload: Hashable, Identifiable {
    let id = UUID()
    var items: [GenerationCoordinator.ResultItem]
    var conceptId: String?
    var conceptTitle: String
}

/// 로그인 뒤 자동으로 이어갈 동작 (1.x `rimikimi_pending_tool` / `pendingContinue` 와 같은 뜻).
enum PendingAction {
    case generate(GenerateRequest)
    case filterPick
    case camera
}

@MainActor
@Observable
final class AppState {
    var tab: TabID = .gallery
    var galleryPath: [Route] = []
    var myPhotosPath: [Route] = []
    var profilePath: [Route] = []

    var loginSheet = false
    var loginMessage: String?
    var pending: PendingAction?
    var toast: String?
    /// 크레딧 부족 시트(팩·구독·초대) — 1주차는 자리만.
    var creditsSheet = false
    /// 편집기·카메라 1단계 웹뷰(SPEC §5).
    var webTool: WebTool?

    struct WebTool: Identifiable { let id = UUID(); let url: URL; let title: String }

    let auth = AuthStore.shared
    let generation = GenerationCoordinator()
    let concepts = ConceptStore()
    let userPhoto = UserPhotoStore()
    private(set) var quota: QuotaInfo?

    // MARK: 로그인 게이트

    /// 로그인돼 있으면 바로, 아니면 시트를 띄우고 로그인 뒤 이어간다.
    func requireLogin(_ action: PendingAction, message: String? = nil) {
        if auth.isSignedIn {
            Task { await perform(action) }
        } else {
            pending = action
            loginMessage = message
            loginSheet = true
        }
    }

    /// `AuthStore.signInTick` 이 오르면 호출 — 하던 동작을 이어간다.
    func resumePending() {
        loginSheet = false
        guard let action = pending else { return }
        pending = nil
        Task { await perform(action) }
        Task { await refreshQuota() }
    }

    func perform(_ action: PendingAction) async {
        switch action {
        case .generate(let req):
            guard let token = await auth.validAccessToken() else { loginSheet = true; return }
            HapticPlayer.commit()
            generation.start(req, token: token)
            // 홈으로 복귀 + 내 사진 진행 카드 (SPEC §3).
            galleryPath.removeAll()
            tab = .myPhotos
        case .filterPick:
            webTool = WebTool(url: Config.filterToolURL, title: "필터")
        case .camera:
            webTool = WebTool(url: Config.cameraToolURL, title: "카메라")
        }
    }

    // MARK: 크레딧

    func refreshQuota() async {
        guard let token = await auth.validAccessToken() else { quota = nil; return }
        if let q = try? await RimikimiAPI.shared.fetchQuota(token: token) { quota = q }
    }

    func signOut() {
        auth.signOut()
        quota = nil
    }

    // MARK: 결과 화면

    func present(_ items: [GenerationCoordinator.ResultItem], job: GenerationCoordinator.Job?) {
        let payload = ResultPayload(items: items, conceptId: job?.conceptId, conceptTitle: job?.conceptTitle ?? "")
        tab = .myPhotos
        myPhotosPath = [.result(payload)]
    }

    func showToast(_ message: String) { toast = message }
}
