import AppTrackingTransparency
import Foundation

/// ATT(추적 허용) — SPEC §3 "팝업 겹치기 금지, ATT 는 첫 생성 완료 후".
/// 실행 시에는 절대 부르지 않는다. 첫 결과 화면이 뜬 뒤 1초에 **딱 한 번**(UserDefaults 플래그).
/// 끝나면 `completion` — 그 다음 순서(초대 카드)가 겹치지 않게 여기서 이어 부른다.
@MainActor
enum TrackingPrompt {
    private static let askedKey = "rimikimi.att.asked.v1"

    static var asked: Bool { UserDefaults.standard.bool(forKey: askedKey) }

    /// 결과 화면 표시 직후 호출. 이미 물었으면 completion 만 바로 부른다.
    static func requestOnceAfterFirstResult(delay: TimeInterval = 1.0, completion: (() -> Void)? = nil) {
        guard !asked else { completion?(); return }
        UserDefaults.standard.set(true, forKey: askedKey)
        Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            if ATTrackingManager.trackingAuthorizationStatus == .notDetermined {
                let status = await ATTrackingManager.requestTrackingAuthorization()
                AppLog.ui.info("att.status \(status.rawValue)")
            }
            completion?()
        }
    }
}
