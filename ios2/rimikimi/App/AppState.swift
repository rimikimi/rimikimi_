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
    /// 첫 생성 완료 → ATT → 초대 카드(홈 상단 1회).
    var showInviteCard = false
    #if DEBUG
    /// dev/fit 캡처용 — 결과 화면이 뜨면 정방향 맞춤 시트를 바로 연다.
    var devAutoOpenFit = false
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
