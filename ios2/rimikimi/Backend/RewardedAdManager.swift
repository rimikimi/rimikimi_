import Foundation
import GoogleMobileAds

/// 보상형 광고 — "광고 보고 만들기"(오너 2026-10-12: 생성 후 전면광고 대신, 만들기 전에 사용자가 골라서 보는 광고).
/// 규칙: 끝까지 보면(리워드) true. 광고가 없거나(no-fill)·실패·제한 시간 초과면 **막지 않고** true —
/// 광고 재고 때문에 사용자가 못 만드는 일이 없게. 중간에 닫아 리워드를 못 받으면 false(만들기 취소).
@MainActor
final class RewardedAdManager: NSObject {
    static let shared = RewardedAdManager()

    private static let unitID = "ca-app-pub-9458625554324585/5049460278"
    private static let testUnitID = "ca-app-pub-3940256099942544/1712485313"
    /// 개발 중엔 테스트 광고(실광고를 눌러 계정 정책 위반이 되지 않게).
    #if DEBUG
    private static let activeUnitID = testUnitID
    #else
    private static let activeUnitID = unitID
    #endif
    private static let loadTimeout: TimeInterval = 8

    private var ad: RewardedAd?
    private var isLoading = false
    private var earned = false
    private var waiter: CheckedContinuation<Bool, Never>?

    /// 앱 시작·생성 직후에 미리 불러 둔다.
    func preload() {
        guard ad == nil, !isLoading else { return }
        isLoading = true
        RewardedAd.load(with: Self.activeUnitID, request: Request()) { [weak self] ad, error in
            Task { @MainActor in
                guard let self else { return }
                self.isLoading = false
                if let ad { ad.fullScreenContentDelegate = self; self.ad = ad; AppLog.ui.info("rewarded.load.ok") }
                else { AppLog.ui.info("rewarded.load.failed \(error?.localizedDescription ?? "-", privacy: .public)") }
            }
        }
    }

    /// 광고를 보여 주고 끝날 때까지 기다린다. true = 만들기 진행.
    func showForReward() async -> Bool {
        if ad == nil {
            preload()
            // 아직 없으면 잠깐만 기다린다.
            let deadline = Date().addingTimeInterval(Self.loadTimeout)
            while ad == nil, Date() < deadline { try? await Task.sleep(nanoseconds: 200_000_000) }
        }
        guard let ad else { AppLog.ui.info("rewarded.skip noAd"); return true }
        earned = false
        return await withCheckedContinuation { c in
            waiter = c
            ad.present(from: nil) { [weak self] in
                Task { @MainActor in self?.earned = true }
            }
        }
    }

    private func finish(_ ok: Bool) {
        ad = nil
        waiter?.resume(returning: ok); waiter = nil
        preload()
    }
}

extension RewardedAdManager: FullScreenContentDelegate {
    nonisolated func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        Task { @MainActor in self.finish(self.earned) }
    }
    nonisolated func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        Task { @MainActor in self.finish(true) }   // 못 띄웠으면 막지 않는다
    }
}
