import SwiftUI
import Observation
import UIKit

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

/// 채워 맞춤(outpaint) 진행 상태.
enum OutpaintPhase: Equatable {
    case idle, running
    case error(String)
}

/// 로그인 뒤 자동으로 이어갈 동작 (1.x `rimikimi_pending_tool` / `pendingContinue` 와 같은 뜻).
enum PendingAction {
    case generate(GenerateRequest)
    case filterPick(presetKey: String?)
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
    /// 채워 맞춤(outpaint) 진행 상태 — `FitSheet` 가 지켜본다.
    var outpaintPhase: OutpaintPhase = .idle
    /// 크레딧 부족으로 미룬 채워 맞춤 원본 — 구매 뒤 `continueAfterPurchase` 가 이어간다.
    private var pendingOutpaintPhoto: UIImage?
    /// `CreditsSheet` 문구용 — 생성이든 채워 맞춤이든, 구매 후 뭔가 이어갈 게 있으면 true.
    var willContinueAfterPurchase: Bool { pendingAfterPurchase != nil || pendingOutpaintPhoto != nil }
    private var outpaintCompletion: ((UIImage) -> Void)?
    #if DEBUG
    /// 캡처용: 채워 맞춤 진행 화면을 잠깐 보이게 인위적 지연을 준다(실서버는 즉시 성공/실패한다).
    var outpaintDebugDelaySeconds: Double = 0
    #endif
    /// 편집기·카메라 1단계 웹뷰(SPEC §5).
    var webTool: WebTool?
    /// 첫 실행 가이드 1장 — 실행 시 다른 팝업은 없다.
    var showGuide = !UserDefaults.standard.bool(forKey: "guide.done.v2")
    /// 홈 상단 초대 카드 — build 90 실기기 결함 #5(오너 지시): 예전엔 첫 생성 완료 후 1회만 떴는데
    /// 1.x 는 홈 맨 위에 항상 있었다. 이제 사용자가 닫기 전까진 상시 노출하고, 닫으면 그 상태를
    /// `inviteCardDismissedKey` 로 영구 기억한다. 초대는 크레딧이 도는 유일한 통로라 이미 친구를
    /// 초대해 본 사용자에게도 계속 보여준다 — 서버에 "1회성" 제한이 없고(재초대해도 계속 크레딧을
    /// 받을 수 있어 보임, `RimikimiAPI.referralCount` 참고) 언제든 닫을 수 있으니 상시 노출 쪽이 낫다고
    /// 판단했다. 명시적으로 "이미 초대를 다 쓴 사용자"를 구분하는 서버 플래그는 없다(`api/` 미확인 범위 —
    /// 필요하면 별도 확인).
    var showInviteCard = !UserDefaults.standard.bool(forKey: AppState.inviteCardDismissedKey)
    private static let inviteCardDismissedKey = "invite.card.dismissed.v1"

    /// 탭 화면 스크롤 콘텐츠의 하단 여백.
    /// ⚠️ **탭바 프레임을 재서 계산하지 말 것** (2026-09-16 build 91 사고 — 같은 측정값을 쓰던
    ///    카메라 버튼이 화면 한가운데로 갔다. `RootTabView.cameraBottomPadding` 주석 참고).
    ///    고정 24pt 로는 마지막 콘텐츠가 떠 있는 탭바에 가려서(결함 #4) 넉넉한 고정값을 쓴다.
    ///    여백이 조금 남는 건 해가 없지만, 모자라면 콘텐츠가 가려진다 — 넉넉한 쪽으로 둔다.
    var contentBottomPad: CGFloat { TabBarMetrics.contentBottomPad }
    #if DEBUG
    /// dev/fit 캡처용 — 결과 화면이 뜨면 정방향 맞춤 시트를 바로 연다.
    var devAutoOpenFit = false
    /// 결함 #4 검증 캡처용(`dev/devscrollbottom`) — 탭 루트 화면들이 처음부터 맨 아래로 스크롤된
    /// 상태로 뜨게 한다. 실기기 터치 없이 "스크롤 끝까지 내렸을 때 탭바에 안 가리는지"를 캡처하기 위함.
    /// `RimikimiApp.task` 의 `DevRoutes.handleLaunchArguments` 는 `concepts.load()` 등 여러 await
    /// 뒤에 실행돼 GalleryHomeView 가 이미 첫 렌더(스크롤 위치 확정)를 끝낸 뒤라 `.defaultScrollAnchor`
    /// 가 안 먹는다 — 그래서 여기 `init()` 에서 launch argument 를 동기적으로 직접 읽는다.
    var devScrollToBottom = ProcessInfo.processInfo.arguments.contains { $0.contains("devscrollbottom") }
    #endif

    struct WebTool: Identifiable {
        let id = UUID(); let url: URL; let title: String
        /// 편집기에 실어 보낼 초기 데이터(결과 화면 "다듬기" → 사진 1장). `WebBridgeCoordinator.initialPayload`.
        var initialPayload: [String: Any]? = nil
    }

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
        case .filterPick(let presetKey):
            webTool = WebTool(url: Config.filterToolURL(mode: "pick", presetKey: presetKey), title: "필터")
        case .camera:
            webTool = WebTool(url: Config.cameraToolURL, title: "카메라")
        }
    }

    /// 결과 화면 "다듬기" — 지금 보고 있는 사진을 편집기에 바로 실어 보낸다(사진 선택 화면 생략).
    func openEditor(image: UIImage) {
        let data = image.jpegData(compressionQuality: 0.92) ?? Data()
        let dataUrl = "data:image/jpeg;base64,\(data.base64EncodedString())"
        webTool = WebTool(url: Config.filterToolURL(mode: "edit"), title: "다듬기",
                           initialPayload: ["mode": "edit", "src": dataUrl])
    }

    /// 생성이 429 로 실패하면 크레딧 시트를 띄우고, 구매 뒤 같은 요청을 이어간다.
    func handleGenerationFailure() {
        guard generation.quotaExceeded, let req = lastRequest else { return }
        pendingAfterPurchase = req
        creditsSheet = true
    }

    /// 구매 성공 → 크레딧 갱신 → 하던 생성(또는 채워 맞춤) 이어가기.
    func continueAfterPurchase() async {
        await refreshQuota()
        creditsSheet = false
        if let req = pendingAfterPurchase {
            pendingAfterPurchase = nil
            generation.dismiss()
            await perform(.generate(req))
            return
        }
        if let photo = pendingOutpaintPhoto {
            pendingOutpaintPhoto = nil
            await runOutpaint(photo)
        }
    }

    // MARK: 채워 맞춤 (outpaint)

    /// `FitSheet` "채워 맞춤" 버튼 — 크레딧 부족이면 시트를 띄우고, 완료되면 `completion` 으로 결과 이미지를 돌려준다.
    func requestOutpaint(_ image: UIImage, completion: @escaping (UIImage) -> Void) {
        outpaintCompletion = completion
        Task { await runOutpaint(image) }
    }

    private func runOutpaint(_ image: UIImage) async {
        guard let token = await auth.validAccessToken() else { loginSheet = true; return }
        if let q = quota, q.unlimited != true, q.creditsAvailable + q.freeLeft < 1 {
            pendingOutpaintPhoto = image
            creditsSheet = true
            return
        }
        outpaintPhase = .running
        #if DEBUG
        if outpaintDebugDelaySeconds > 0 { try? await Task.sleep(nanoseconds: UInt64(outpaintDebugDelaySeconds * 1_000_000_000)) }
        #endif
        do {
            let result = try await RimikimiAPI.shared.outpaint(image: image, token: token)
            outpaintPhase = .idle
            await refreshQuota()
            outpaintCompletion?(result.image)
            outpaintCompletion = nil
        } catch let error as APIError {
            outpaintPhase = .error(error.message)
        } catch {
            outpaintPhase = .error("채워 맞춤에 실패했어요. 잠시 후 다시 시도해 주세요.")
        }
    }

    /// 시트가 닫히거나 다시 열릴 때 이전 상태를 지운다.
    func resetOutpaintPhase() { outpaintPhase = .idle }

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

    /// 완료 푸시 탭 → 결과 화면. 알림 payload 엔 `{kind:"genDone", count}` 뿐이라(서버 `api/generate.js`
    /// `notifyDone`, 이미지·갤러리 id 없음) 정확히 "그 결과"를 지목할 수 없다 — 서버 payload 를 늘리지
    /// 않는 한(SPEC §0 "서버는 그대로") 최선은 **완료 직후 갤러리 최신 항목**을 여는 것. 보통 알림이 온
    /// 시점엔 그게 곧 이번 결과다.
    func openLatestGalleryResult() {
        openGalleryResult(galleryId: nil)
    }

    /// 완료 푸시 탭 → 결과 화면. `galleryId` 가 있으면(4주차, 서버가 payload 에 실으면) 그 항목을 정확히
    /// 연다. 없으면(구버전 서버·이미 깔린 앱) 지금처럼 **최신 갤러리 항목**으로 폴백한다. `galleryId` 가
    /// 있는데 그 항목이 갤러리 목록에 아직 없으면(드문 타이밍 어긋남) 그때도 최신 항목으로 물러선다.
    func openGalleryResult(galleryId: String?) {
        Task {
            guard let token = await auth.validAccessToken(),
                  let items = try? await RimikimiAPI.shared.fetchGallery(token: token) else { return }
            guard let item = (galleryId.flatMap { id in items.first { $0.id == id } }) ?? items.first else { return }
            present([.init(id: item.id, image: nil, url: item.url, expiresAt: item.expiresAt)],
                    job: .init(conceptId: item.conceptId ?? "", conceptTitle: item.conceptTitle ?? "",
                               startedAt: item.createdAt ?? Date(), count: 1))
        }
    }

    /// 첫 생성 완료 직후 1회: ATT 권한 요청. 초대 카드는 더 이상 여기서 켜지 않는다 — 홈에 상시
    /// 노출로 바뀌었다(결함 #5, `showInviteCard` 초기값 참고). 키 이름은 예전 그대로 재사용(ATT 1회
    /// 트리거 용도로만 씀, 마이그레이션 불필요).
    func afterFirstResult() {
        let key = "invite.card.shown.v1"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        TrackingPrompt.requestOnceAfterFirstResult()
    }

    /// 홈 초대 카드를 닫는다 — 닫힌 상태를 영구 기억해 다음 실행에도 다시 뜨지 않게 한다(결함 #5).
    func dismissInviteCard() {
        showInviteCard = false
        UserDefaults.standard.set(true, forKey: Self.inviteCardDismissedKey)
    }

    func finishGuide() {
        UserDefaults.standard.set(true, forKey: "guide.done.v2")
        showGuide = false
    }

    func showToast(_ message: String) { toast = message }
}
