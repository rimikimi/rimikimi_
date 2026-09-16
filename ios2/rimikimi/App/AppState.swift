import SwiftUI
import Observation

/// 탭 밖에서 공유되는 화면 상태 — 탭 선택, 스택 경로, 로그인 시트, 하던 동작(pending) 재개.
enum TabID: Hashable { case gallery, filter, camera, myPhotos, profile }

/// 각 탭 스택의 목적지.
enum Route: Hashable {
    case concept(Concept)
    case category(String)
    case result(ResultPayload)
    case store
    case invite
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
    /// 크레딧 부족 시트(팩 3 · 구독 · 초대). 구매 성공 시 `pendingAfterPurchase` 를 이어간다.
    var creditsSheet = false
    var pendingAfterPurchase: GenerateRequest?
    /// 편집기·카메라 1단계 웹뷰(SPEC §5).
    var webTool: WebTool?
    /// 첫 실행 가이드 1장 — 실행 시 다른 팝업은 없다.
    var showGuide = !UserDefaults.standard.bool(forKey: "guide.done.v2")
    /// 첫 생성 완료 → ATT → 초대 카드(홈 상단 1회).
    var showInviteCard = false
    #if DEBUG
    /// dev/fit 캡처용 — 결과 화면이 뜨면 정방향 맞춤 시트를 바로 연다.
    var devAutoOpenFit = false
    #endif

    struct WebTool: Identifiable { let id = UUID(); let url: URL; let title: String }

    let auth = AuthStore.shared
    let generation = GenerationCoordinator()
    let concepts = ConceptStore()
    let userPhoto = UserPhotoStore()
    let store = StoreManager()
    let push = PushManager.shared
    private(set) var quota: QuotaInfo?
    /// 마지막 생성 요청 — 크레딧 부족으로 실패했을 때 구매 뒤 이어가기 위해.
    private var lastRequest: GenerateRequest?

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
        // ⚠️ 크레딧 갱신은 pending 유무와 무관하다 — 예전엔 guard 뒤에 있어 그냥 로그인만 하면 칩이 "–" 로 남았다.
        Task { await refreshQuota() }
        if let uid = auth.session?.userID { Task { await store.logIn(userID: uid) } }
        guard let action = pending else { return }
        pending = nil
        Task { await perform(action) }
    }

    func perform(_ action: PendingAction) async {
        switch action {
        case .generate(var req):
            guard let token = await auth.validAccessToken() else { loginSheet = true; return }
            // 크레딧 부족이면 시트 먼저 — 서버에 보내 봐야 429 다(SPEC §3 "크레딧 부족이면 팩·구독·초대 시트").
            if let q = quota, q.unlimited != true, q.creditsAvailable + q.freeLeft < req.creditCost {
                pendingAfterPurchase = req
                creditsSheet = true
                return
            }
            if req.faceRef == nil, !req.concept.isArtTransform { req.faceRef = userPhoto.image }
            lastRequest = req
            HapticPlayer.commit()
            generation.start(req, token: token, pushToken: push.fcmToken)
            // 홈으로 복귀 + 내 사진 진행 카드 (SPEC §3).
            galleryPath.removeAll()
            tab = .myPhotos
        case .filterPick:
            webTool = WebTool(url: Config.filterToolURL, title: "필터")
        case .camera:
            webTool = WebTool(url: Config.cameraToolURL, title: "카메라")
        }
    }

    /// 생성이 429 로 실패하면 크레딧 시트를 띄우고, 구매 뒤 같은 요청을 이어간다.
    func handleGenerationFailure() {
        guard generation.quotaExceeded, let req = lastRequest else { return }
        pendingAfterPurchase = req
        creditsSheet = true
    }

    /// 구매 성공 → 크레딧 갱신 → 하던 생성 이어가기.
    func continueAfterPurchase() async {
        await refreshQuota()
        creditsSheet = false
        guard let req = pendingAfterPurchase else { return }
        pendingAfterPurchase = nil
        generation.dismiss()
        await perform(.generate(req))
    }

    // MARK: 크레딧

    func refreshQuota() async {
        guard let token = await auth.validAccessToken() else { quota = nil; return }
        if let q = try? await RimikimiAPI.shared.fetchQuota(token: token) { quota = q }
    }

    func signOut() {
        auth.signOut()
        quota = nil
        Task { await store.logOut() }
    }

    // MARK: 결과 화면

    func present(_ items: [GenerationCoordinator.ResultItem], job: GenerationCoordinator.Job?) {
        let payload = ResultPayload(items: items, conceptId: job?.conceptId, conceptTitle: job?.conceptTitle ?? "")
        tab = .myPhotos
        myPhotosPath = [.result(payload)]
    }

    /// 첫 생성 완료 직후 1회: ATT → 초대 카드.
    func afterFirstResult() {
        let key = "invite.card.shown.v1"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        TrackingPrompt.requestOnceAfterFirstResult { [weak self] in
            self?.showInviteCard = true
        }
    }

    func finishGuide() {
        UserDefaults.standard.set(true, forKey: "guide.done.v2")
        showGuide = false
    }

    func showToast(_ message: String) { toast = message }
}
