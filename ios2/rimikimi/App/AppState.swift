import SwiftUI
import Observation
import UIKit

/// 탭 밖에서 공유되는 화면 상태 — 탭 선택, 스택 경로, 로그인 시트, 하던 동작(pending) 재개.
enum TabID: Hashable { case gallery, filter, camera, myPhotos, profile }

/// 각 탭 스택의 목적지.
enum Route: Hashable {
    case concept(Concept)
    case category(String)
    /// 카테고리 안의 사진들을 필름스트립으로 훑어보는 화면(네이티브 사진 앱 참고, 오너 지시
    /// 2026-09-19) — `startID` 는 어떤 사진을 누르고 들어왔는지.
    case browse(category: String, startID: String)
    case result(ResultPayload)
    case store
    case invite

    /// 이 화면이 탭바를 그대로 두는지(`.toolbar(.hidden, for: .tabBar)` 를 안 쓰는지).
    /// 떠 있는 카메라 원을 그릴지 판단하는 유일한 기준 — 탭바가 보이는데 카메라 원만 사라지면
    /// 안 된다(오너 지적 2026-09-22: "카테고리 안에 들어가면 카메라 버튼 없어지는데 그대로 있어야 함").
    /// 반대로 탭바를 숨기는 화면에서는 원도 숨겨야 한다 — 안 그러면 "만들기" 바 위에 겹친다.
    var keepsTabBar: Bool {
        switch self {
        case .category: return true
        case .concept, .browse, .result, .store, .invite: return false
        }
    }
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

    /// 지금 보이는 탭의 스택. 필터 탭은 푸시가 없고, 카메라 슬롯은 탭이 아니라 동작이라 빈 스택.
    var activePath: [Route] {
        switch tab {
        case .gallery: return galleryPath
        case .myPhotos: return myPhotosPath
        case .profile: return profilePath
        case .filter, .camera: return []
        }
    }
    /// 떠 있는 카메라 원을 그릴지 — 탭바가 실제로 보이는 화면에서만.
    var showsCameraTabButton: Bool { activePath.last?.keepsTabBar ?? true }

    var loginSheet = false
    var loginMessage: String?
    var pending: PendingAction?
    var toast: String?
    /// 제3자 AI(Google Gemini) 전송 고지 — 첫 "만들기" 전 1회만(Apple 5.1.1(i)/5.1.2(i) +
    /// AI기본법 §31 사전고지, 컴플라이언스 리뷰로 발견). `AIConsentSheet` 가 지켜본다.
    /// ⚠️ **매 생성마다 다시 묻지 않는다** — 다른 플래그들(`guide.done.v2` 등)과 같은 관례로
    /// UserDefaults 에 1회만 기록, 동의 즉시 미뤄둔 요청을 이어간다(오너 지시 2026-09-19).
    var aiConsentSheet = false
    private var pendingAfterConsent: GenerateRequest?
    /// 채워 맞춤(outpaint)도 같은 Gemini 전송이라 같은 동의가 필요하다(재검증으로 발견 — 결과
    /// 화면을 거치지 않고 도달하는 이론적 우회가 남아 있었다). 이미지+완료 콜백을 미뤄둔다.
    private var pendingOutpaintAfterConsent: (image: UIImage, completion: (UIImage) -> Void)?
    private static let aiConsentKey = "ai.consent.v1"
    static var aiConsentGiven: Bool { UserDefaults.standard.bool(forKey: aiConsentKey) }
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
    /// 아이폰 기본 카메라 화면 표시 여부.
    var showSystemCamera = false
    /// 얼굴 스캔(Face ID 등록식) 화면 — 프로필에서 연다.
    var showFaceScan = false
    /// 연속 촬영 카메라 — 여러 장 찍어 한 번에 필터(오너 지시 2026-09-22, 시험 중).
    var showBurstCamera = false
    /// 시스템 사진 선택창 — 필터를 고른 뒤 여기서 사진을 먼저 고른다.
    /// (웹에서 파일창을 자동으로 못 여는 제약 때문. `PhotoPicker` 주석 참고)
    var photoPickPreset: String?     // nil 이면 닫힘
    var showPhotoPicker = false
    /// 카메라 구현 스위치 — true = 아이폰 기본 카메라(현재), false = 옛 웹뷰 카메라(폴백).
    /// 웹뷰 쪽은 지우지 않고 남겨 둔다(문제가 생기면 한 줄로 되돌릴 수 있게).
    static let useSystemCamera = true
    /// 카메라 버튼이 여는 화면 — true = 연속 촬영(여러 장 → 한 번에 필터), false = 아이폰 기본 카메라 한 장.
    /// 컨셉 사진용 경로(내 사진 등록 등)는 이 스위치와 무관하게 기본 카메라·앨범을 쓴다.
    static let useBurstCamera = true
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
        /// 상단바 없이 화면을 통째로 쓴다. 카메라는 **아이폰 기본 카메라처럼** 보여야 한다는
        /// 오너 지시(2026-09-17) — 상단바가 있으면 웹 카메라 헤더와 겹쳐 두 줄이 되고,
        /// 미리보기도 화면을 못 채운다. 닫기는 웹 쪽 버튼이 브리지로 처리한다.
        var chromeless: Bool = false
    }

    let auth = AuthStore.shared
    let generation = GenerationCoordinator()
    let concepts = ConceptStore()
    let favorites = FavoritesStore()
    let faceProfile = FaceProfileStore()
    let userPhoto = UserPhotoStore()
    let store = StoreManager()
    let push = PushManager.shared
    private(set) var quota: QuotaInfo?
    /// 캡처·검증용 — 카테고리 격자를 5열로 시작(dev 라우트에서만 켜진다. 릴리스에선 항상 false).
    /// ⚠️ `#if DEBUG` 안에 두면 호출부를 `#if` 로 갈라야 하고, 그러면 뒤에 붙는 modifier 가
    ///    붙지 않는다(릴리스 아카이브에서 실제로 걸렸다). 그래서 빌드 구분 없이 둔다.
    var devWideColumns = false

    /// 마지막 생성 요청 — 크레딧 부족으로 실패했을 때 구매 뒤 이어가기 위해.
    private var lastRequest: GenerateRequest?

    init() {
        // "⭐ 즐겨찾기" 앨범과 홈 정렬만 `FavoritesStore` 를 알면 된다 — `ConceptStore` 가 직접
        // 의존하지 않도록 클로저로 잇는다.
        concepts.favoriteIDs = { [favorites] in favorites.concepts }
        concepts.favoriteCategories = { [favorites] in favorites.categories }
    }

    /// 얼굴 스캔 결과 저장 — 3장은 기기에, 정면 1장은 기존 "내 사진" 자리에도 넣는다(옵션 화면·
    /// 커플·매직부스 등 기존 경로가 전부 `userPhoto` 를 본다).
    func saveFaceProfile(_ shots: [FaceProfileStore.Angle: UIImage]) {
        faceProfile.save(shots)
        if let front = shots[.front] { userPhoto.set(front) }
        toast = "얼굴 프로필을 저장했어요"
    }

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
            // 제3자 AI 전송 고지 — 계정당(기기당) 1회만. 동의 전이면 요청을 미뤄두고 시트를 띄운다.
            guard Self.aiConsentGiven else {
                pendingAfterConsent = req
                aiConsentSheet = true
                return
            }
            // 크레딧 부족이면 시트 먼저 — 서버에 보내 봐야 429 다(SPEC §3 "크레딧 부족이면 팩·구독·초대 시트").
            if let q = quota, q.unlimited != true, q.creditsAvailable + q.freeLeft < req.creditCost {
                pendingAfterPurchase = req
                creditsSheet = true
                return
            }
            if req.faceRef == nil, !req.concept.isArtTransform { req.faceRef = userPhoto.image }
            // 얼굴 스캔을 해 뒀으면 정면·좌·우 3장을 참조로 보낸다 — 각도가 여러 장일수록 얼굴
            // 재현이 정확하다(스튜디오 실증, `_design/face-profile-v1.md` §0). 서버는 이미
            // 여러 장(`faceRefs`)을 받도록 돼 있어 서버 변경은 없다.
            if !req.concept.isArtTransform, req.faceProfile.isEmpty {
                req.faceProfile = faceProfile.ordered.map { ($0.image, $0.angle.rawValue) }
            }
            lastRequest = req
            HapticPlayer.commit()
            generation.start(req, token: token, pushToken: push.fcmToken)
            // 홈으로 복귀 + 내 사진 진행 카드 (SPEC §3).
            galleryPath.removeAll()
            tab = .myPhotos
        case .filterPick(let presetKey):
            // 사진을 **먼저** 고른다 — 웹의 "사진 선택" 빈 화면을 없애기 위해(오너 지적 2026-09-17).
            photoPickPreset = presetKey ?? "none"
            showPhotoPicker = true
        case .camera:
            // 아이폰 **기본 카메라 화면**을 띄운다(오너 지시 2026-09-17).
            // 웹뷰 카메라는 포커스·줌을 못 써서 폐기 — 폴백 경로로만 남긴다(useSystemCamera).
            // 2026-09-22: 필터는 "여러 장 찍어 한 번에" 가 핵심이라 연속 촬영 화면을 먼저 띄운다.
            // 기본 카메라는 한 장 찍으면 바로 앱으로 돌아와 연속 촬영이 불가능하다(`BurstCameraView` 주석).
            if Self.useBurstCamera { showBurstCamera = true }
            else if Self.useSystemCamera { showSystemCamera = true }
            else { webTool = WebTool(url: Config.cameraToolURL, title: "카메라", chromeless: true) }
        }
    }

    /// 기본 카메라로 찍은 직후 — 앨범에 저장하고 편집기(필터)로 넘긴다.
    /// SPEC §3: "셔터 → 즉시 앨범 저장 → 다듬기·공유". 기본 카메라는 라이브 필터를 못 얹으므로
    /// **찍고 나서** 필터를 입히는 순서가 된다.
    /// 연속 촬영 완료 — 찍은 컷을 앨범에 남기고, 전부 편집기로 넘겨 필터를 한 번에 입힌다.
    /// (편집기는 이미 여러 장을 받도록 돼 있다 — `PhotoEditor` 의 `srcs`.)
    func finishBurstCamera(_ images: [UIImage]) {
        showBurstCamera = false
        guard !images.isEmpty else { return }
        Task {
            var saved = 0
            for img in images where await CameraAlbum.save(img) { saved += 1 }
            showToast(saved == images.count ? "\(saved)장을 앨범에 저장했어요" : "앨범 저장 권한이 없어요")
        }
        handlePickedPhotos(images)
    }

    func handleCameraShot(_ image: UIImage) {
        showSystemCamera = false
        Task {
            let saved = await CameraAlbum.save(image)
            showToast(saved ? "앨범에 저장했어요" : "앨범 저장 권한이 없어요")
            openEditor(image: image)
        }
    }

    /// 사진 선택 완료 → 고른 사진들을 편집기에 실어 보낸다.
    func handlePickedPhotos(_ images: [UIImage]) {
        showPhotoPicker = false
        let preset = photoPickPreset ?? "none"
        photoPickPreset = nil
        guard !images.isEmpty else { return }
        // 편집기는 1080px 미리보기로 줄여 쓰므로 여기서 과하게 큰 원본을 보낼 이유가 없다.
        // (base64 로 웹뷰에 넘기는 값이라 너무 크면 느려진다)
        let srcs: [String] = images.prefix(10).compactMap { img in
            let scaled = img.downscaled(maxLong: 2048)
            guard let d = scaled.jpegData(compressionQuality: 0.92) else { return nil }
            return "data:image/jpeg;base64,\(d.base64EncodedString())"
        }
        guard !srcs.isEmpty else { return }
        webTool = WebTool(url: Config.filterToolURL(mode: "edit", presetKey: preset), title: "꾸미기",
                          initialPayload: ["mode": "edit", "srcs": srcs])
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

    /// 동의 시트 "동의하고 계속" — 플래그를 1회 기록하고 시트를 닫는다. **미뤄둔 동작은 아직
    /// 이어가지 않는다** — `resumeAfterConsentDismissed()`(시트의 `onDismiss`)가 이어간다.
    /// ⚠️ 재검증으로 발견(2026-09-19): 여기서 곧바로 `perform` 을 부르면, 크레딧이 부족해
    /// `creditsSheet = true` 가 되는 경우 "동의 시트가 닫히는 중에 크레딧 시트를 새로 띄우는"
    /// 경합이 생겨 조용히 무반응이 될 수 있었다(같은 프레젠터, UIKit 모달 1개 제한).
    func continueAfterConsent() {
        UserDefaults.standard.set(true, forKey: Self.aiConsentKey)
        aiConsentSheet = false
    }

    /// 동의 시트 "다음에" — 그냥 취소. 사진 생성이 핵심 기능이라 대체 경로는 없고,
    /// 다시 "만들기"를 누르면 시트가 또 뜬다(부작용 없음). 미뤄둔 동작도 전부 버린다 —
    /// `onDismiss` 가 아무것도 이어가지 않게.
    func cancelConsent() {
        aiConsentSheet = false
        pendingAfterConsent = nil
        pendingOutpaintAfterConsent = nil
    }

    /// `aiConsentSheet` 의 `onDismiss` — 시트가 **완전히 닫힌 뒤**(전환 애니메이션 끝) 호출된다.
    /// 동의했을 때만 미뤄둔 생성/채워맞춤이 남아 있으므로, 취소면 위 두 슬롯이 이미 비어 있어
    /// 아무 일도 안 한다. 새 시트(크레딧 시트 등)를 여기서 열어도 이전 시트와 경합하지 않는다.
    func resumeAfterConsentDismissed() {
        if let req = pendingAfterConsent {
            pendingAfterConsent = nil
            Task { await perform(.generate(req)) }
        } else if let pending = pendingOutpaintAfterConsent {
            pendingOutpaintAfterConsent = nil
            requestOutpaint(pending.image, completion: pending.completion)
        }
    }

    /// 구매 성공 → 크레딧 갱신 → 하던 생성(또는 채워 맞춤) 이어가기.
    func continueAfterPurchase() async {
        await refreshQuota()
        creditsSheet = false
        if let req = pendingAfterPurchase {
            pendingAfterPurchase = nil
            generation.dismissFinished()
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
    /// 이 경로도 사진을 Gemini 로 보내므로(`RimikimiAPI.outpaint`) 제3자 AI 전송 동의가 먼저 필요하다
    /// (재검증으로 발견 — 보통은 결과 화면을 거쳐야만 도달해 이미 동의된 상태지만, 이론적 우회를 막는다).
    func requestOutpaint(_ image: UIImage, completion: @escaping (UIImage) -> Void) {
        guard Self.aiConsentGiven else {
            pendingOutpaintAfterConsent = (image, completion)
            aiConsentSheet = true
            return
        }
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
        // "이미 만들어 본 컨셉" 표시용 — 서버 갤러리는 24시간만 남으므로 여기서 기기에 적어 둔다.
        if let id = job?.conceptId { favorites.markGenerated([id]) }
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

    /// 결과 화면이 뜬 동안(`ResultView.onAppear`)마다 호출 — ATT 권한 요청은 그 안에서 1회만
    /// 실제로 시도한다. 초대 카드는 여기서 켜지 않는다 — 홈에 상시 노출로 바뀌었다(결함 #5,
    /// `showInviteCard` 초기값 참고). 키 이름은 예전 그대로 재사용(ATT 1회 트리거 용도로만 씀).
    /// ⚠️ 예전엔 이 함수가 `RootTabView`의 내비게이션 전환 onChange 에서 불렸는데, 그 타이밍엔 앱이
    /// 아직 `.active` 가 아닐 수 있어 팝업 없이 플래그만 타는 결함이 있었다(컴플라이언스 리뷰로
    /// 발견, rimikimi 1.0 을 2번 리젝시킨 것과 같은 패턴) — 이제 `ResultView.onAppear`(화면이 진짜
    /// 보이는 시점)에서만 부르고, 플래그도 `TrackingPrompt` 내부에서 실제 결정된 답을 받은 뒤에만
    /// 세운다. 매번 호출해도 안전(이미 물었으면 즉시 반환).
    func afterFirstResult() {
        TrackingPrompt.requestOnceAfterFirstResult()
    }

    /// 생성이 끝난 뒤 **무료 사용자에게만** 전면광고 1회.
    ///
    /// 규칙은 새로 만들지 않고 1.x 를 그대로 옮겼다 — `src/PortraitStudio.jsx:1542`
    /// `showAds = quotaLoaded && !unlimited && credits === 0`:
    ///   - `quota == nil` (아직 못 불러옴) → 안 띄운다. 모르면 안 띄우는 쪽이 맞다.
    ///   - 무제한 계정 → 안 띄운다.
    ///   - 크레딧이 남아 있으면 → 안 띄운다. (크레딧을 쓴 생성에는 광고를 붙이지 않는다는 뜻.
    ///     하루 무료분으로 만든 사람만 광고를 본다.)
    /// 여기서 판정하는 이유는 `GenerationCoordinator` 가 크레딧/무제한 상태를 모르기 때문이다
    /// (`quota` 는 AppState 소유). 코디네이터에 역참조를 심으면 그 파일 구조를 건드리게 된다.
    func showInterstitialAfterGeneration() {
        guard let q = quota, q.unlimited != true, q.creditsAvailable == 0 else { return }
        AdManager.shared.showInterstitial()
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
