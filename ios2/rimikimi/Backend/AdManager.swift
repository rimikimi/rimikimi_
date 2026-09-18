import Foundation
import GoogleMobileAds
import UIKit

/// AdMob 전면(interstitial) 광고.
///
/// 1.x 는 `@capacitor-community/admob` 으로 넣었는데(웹 `src/ads.js`) 2.0 엔 그 플러그인이
/// 양쪽(ios2/rn) 다 없어서 **전면광고가 아예 안 나가고 있었다**. 구글 공식 SPM 배포판으로
/// 다시 붙인 것이 이 파일이다(오너 지시 2026-09-18 "전면광고는 둘 다 넣고").
///
/// 노출 규칙은 새로 만들지 않고 1.x 그대로 옮겼다 — `src/PortraitStudio.jsx` 의
/// `showAds = quotaLoaded && !unlimited && credits === 0` 조건으로 **무료 사용자만**,
/// **생성이 끝난 뒤** 1회. 그 판정은 크레딧 상태를 들고 있는 `AppState.showInterstitialAfterGeneration()`
/// 이 하고, 이 파일은 "띄워 달라" 는 요청만 처리한다.
///
/// ⚠️ **앱이 멈추면 안 된다.** 1.x `src/ads.js` 는 단계마다 타임아웃을 걸어 프리즈를 막는다
///    (iOS WKWebView 에서 동적 청크 로딩이 끝나지 않아 광고가 영영 안 뜨던 사고 기록이 주석에 있다).
///    여기도 같은 방어를 넣었다:
///      - SDK 초기화 콜백이 안 오면 `initTimeout` 뒤에 그냥 로드로 넘어간다.
///      - 광고 로드 콜백이 안 오면 `loadTimeout` 뒤에 `isLoading` 플래그만 풀어 다음 시도를 살린다
///        (이 플래그가 true 로 박히면 그 뒤 로드가 영원히 막힌다).
///      - 표시할 때는 **기다리지 않는 게 원칙**이다. 미리 받아 둔 광고가 없으면 최대 `showWait` 만
///        기다려 보고 없으면 조용히 건너뛴다. 전부 async/await 이라 UI 스레드는 막히지 않는다.
///    어느 단계가 실패해도 예외를 밖으로 내보내지 않는다 — 광고는 있으면 좋고 없으면 마는 것이다.
@MainActor
final class AdManager: NSObject {
    static let shared = AdManager()

    // MARK: 광고 식별자·스위치

    /// 전면 광고 단위 ID (iOS). 1.x `src/ads.js` 의 `IOS_INTERSTITIAL` 과 같은 값.
    /// (앱 ID `ca-app-pub-9458625554324585~5856129775` 는 Info.plist 의 `GADApplicationIdentifier`.)
    private static let interstitialUnitID = "ca-app-pub-9458625554324585/8078673280"

    /// 구글이 공개한 **샘플** 전면광고 단위. 재고/fill 과 무관하게 무조건 뜬다.
    private static let testInterstitialUnitID = "ca-app-pub-3940256099942544/4411468910"

    /// 전면광고 킬스위치. 1.x `INTERSTITIAL_ENABLED` 와 같은 뜻 — 광고가 말썽이면 여기 한 줄로 끈다.
    static let interstitialEnabled = true

    /// ⚠️ 테스트 광고 모드. true 면 실제 광고단위 대신 구글 샘플 광고를 띄운다 → 파이프라인/프리즈 검증용.
    /// **스토어 제출 빌드에서는 반드시 false 로 되돌릴 것!** (안 그러면 수익 0)
    /// 1.x `INTERSTITIAL_TESTING` 과 같은 자리. 상수로 남겨 두라는 것이 오너 지시다.
    static let interstitialTesting = false

    private static var activeUnitID: String {
        interstitialTesting ? testInterstitialUnitID : interstitialUnitID
    }

    // MARK: 타임아웃 (전부 "멈추지 않기" 용도)

    private static let initTimeout: TimeInterval = 10
    private static let loadTimeout: TimeInterval = 15
    /// 표시 시점에 아직 로드 중이면 이만큼만 기다린다. 더 기다리면 이미 결과를 보고 있는
    /// 화면을 뒤늦게 덮는다 — 1.x 주석 "전면광고도 화면이다" 와 같은 이유.
    private static let showWait: TimeInterval = 3

    // MARK: 상태

    private var interstitial: InterstitialAd?
    private var isLoading = false
    /// 타임아웃 감시자가 **자기가 건 시도**만 취소하도록 세는 번호. 없으면 뒤늦게 깨어난 감시자가
    /// 그 사이 새로 시작된 정상 로드의 플래그를 풀어 버린다.
    private var loadAttempt = 0
    private var didStart = false
    private var didKickOffFirstLoad = false

    // MARK: 시작 (앱 실행 시 1회)

    /// SDK 초기화 + 첫 광고 미리 로드. `RimikimiApp` 의 실행 task 에서 부른다.
    ///
    /// ATT(추적 허용) 는 **여기서 건드리지 않는다.** `TrackingPrompt` 가 "첫 생성 완료 후 1회" 로
    /// 이미 소유하고 있고(SPEC §3 팝업 겹치기 금지), 광고 SDK 가 따로 물으면 중복이 된다.
    /// ATT 를 아직 안 물었거나 거부한 상태여도 광고 자체는 나간다(비맞춤 광고).
    func start() {
        guard Self.interstitialEnabled, !didStart else { return }
        didStart = true

        // 초기화 콜백이 안 돌아오는 경우가 있다 → 기다리다 멈추지 말고 시간 되면 그냥 로드로 간다.
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.initTimeout * 1_000_000_000))
            self?.kickOffFirstLoad(reason: "init.timeout")
        }

        MobileAds.shared.start { [weak self] _ in
            Task { @MainActor in self?.kickOffFirstLoad(reason: "init.ok") }
        }
    }

    /// 첫 로드는 초기화 성공과 타임아웃 중 **먼저 오는 쪽**이 시작한다 — 두 번 돌지 않게 플래그로 막는다.
    private func kickOffFirstLoad(reason: String) {
        guard !didKickOffFirstLoad else { return }
        didKickOffFirstLoad = true
        AppLog.ui.info("ads.start \(reason, privacy: .public)")
        loadInterstitial()
    }

    // MARK: 미리 로드

    /// 다음에 보여줄 전면광고를 미리 받아 둔다. 이미 갖고 있거나 받는 중이면 아무것도 안 한다.
    private func loadInterstitial() {
        guard Self.interstitialEnabled, interstitial == nil, !isLoading else { return }
        isLoading = true
        loadAttempt &+= 1
        let attempt = loadAttempt

        // 로드 콜백이 영영 안 오면 `isLoading` 이 true 로 박혀 이후 모든 로드가 막힌다.
        // 시간이 지나면 플래그만 풀어 준다(SDK 가 뒤늦게 응답해도 attempt 번호로 걸러진다).
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.loadTimeout * 1_000_000_000))
            guard let self, self.loadAttempt == attempt, self.isLoading else { return }
            self.isLoading = false
            AppLog.ui.info("ads.load.timeout")
        }

        // ⚠️ 콜백이 어느 스레드로 올지 보장에 기대지 않는다 — MainActor 로 올려서 처리한다.
        InterstitialAd.load(with: Self.activeUnitID, request: Request()) { [weak self] ad, error in
            Task { @MainActor in
                guard let self, self.loadAttempt == attempt else { return }
                self.isLoading = false
                if let ad {
                    ad.fullScreenContentDelegate = self
                    self.interstitial = ad
                    AppLog.ui.info("ads.load.ok")
                } else {
                    // 실패는 조용히 넘어간다(재고 없음 no-fill 이 대부분). 다음 생성 때 다시 시도한다.
                    AppLog.ui.info("ads.load.failed \(error?.localizedDescription ?? "-", privacy: .public)")
                }
            }
        }
    }

    // MARK: 표시

    /// 전면광고 1회 표시. **무료 사용자 판정은 호출하는 쪽이 끝내고 부른다**
    /// (`AppState.showInterstitialAfterGeneration()`).
    func showInterstitial() {
        guard Self.interstitialEnabled else { return }
        Task { await present() }
    }

    private func present() async {
        if interstitial == nil {
            // 미리 로드가 아직 안 끝났거나 실패했다 — 지금이라도 시작해 보되 오래 붙잡지 않는다.
            loadInterstitial()
            let deadline = Date().addingTimeInterval(Self.showWait)
            while interstitial == nil, isLoading, Date() < deadline {
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
        guard let ad = interstitial else {
            AppLog.ui.info("ads.show.skipped")
            loadInterstitial() // 다음 기회를 위해 채워 둔다
            return
        }
        interstitial = nil // 한 광고는 한 번만 — 들고 있다가 두 번 띄우면 SDK 가 거부한다
        AppLog.ui.info("ads.show")
        // rootViewController 를 nil 로 주면 SDK 가 앱 메인 윈도우의 최상단 VC 에서 띄운다.
        // 직접 윈도우를 뒤져 넘기면 시트·fullScreenCover 가 떠 있을 때 틀린 VC 를 집는다.
        ad.present(from: nil)
    }
}

// MARK: - FullScreenContentDelegate
//
// 광고가 닫히거나 표시에 실패하면 **다음 광고를 다시 미리 받아 둔다**. 이게 없으면 첫 광고
// 한 번만 뜨고 그 뒤로는 영영 안 뜬다(들고 있던 광고를 표시하며 비웠기 때문).
extension AdManager: FullScreenContentDelegate {
    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        AppLog.ui.info("ads.dismissed")
        loadInterstitial()
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        AppLog.ui.info("ads.show.failed \(error.localizedDescription, privacy: .public)")
        loadInterstitial()
    }
}
