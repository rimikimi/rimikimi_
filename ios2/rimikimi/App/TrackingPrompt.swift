import AppTrackingTransparency
import Foundation
import UIKit

/// ATT(추적 허용) — SPEC §3 "팝업 겹치기 금지, ATT 는 첫 생성 완료 후".
/// 실행 시에는 절대 부르지 않는다. 첫 결과 화면이 뜬 뒤 1초에 **딱 한 번**(UserDefaults 플래그).
/// 끝나면 `completion` — 그 다음 순서(초대 카드)가 겹치지 않게 여기서 이어 부른다.
///
/// ⚠️ **컴플라이언스 리뷰로 발견(2026-09-18): 예전엔 플래그를 요청 "시도" 시점에 먼저 세웠다.**
/// 그 사이(1초 대기 중이거나, 실제로 `requestTrackingAuthorization` 가 끝나기 전) 앱이 백그라운드로
/// 가면 iOS 가 팝업을 조용히 무시하는데 플래그는 이미 true 로 타버려 **다시는 물어보지 않는다** —
/// rimikimi 1.0 이 정확히 이 패턴으로 심사 2번 리젝된 이력(`APPSTORE_SUBMIT_RUNBOOK.md` §11)과
/// 같은 결함이었다. 지금은 **실제로 결정된 답(notDetermined 가 아님)을 받은 뒤에만** 플래그를 세운다 —
/// 중간에 끊기면 플래그가 안 타서 다음 결과 화면에서 다시 시도한다(`ResultView.onAppear`, 매번 호출해도
/// 이미 물었으면 즉시 completion 만 부르므로 안전).
@MainActor
enum TrackingPrompt {
    private static let askedKey = "rimikimi.att.asked.v1"

    static var asked: Bool { UserDefaults.standard.bool(forKey: askedKey) }

    /// 결과 화면이 실제로 보이는 동안(`onAppear`)에만 호출할 것 — 내비게이션 전환 중이면 앱이
    /// 아직 `.active` 가 아닐 수 있어 그 경우는 시도조차 하지 않고 다음 기회로 미룬다.
    static func requestOnceAfterFirstResult(delay: TimeInterval = 1.0, completion: (() -> Void)? = nil) {
        guard !asked else { completion?(); return }
        Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard UIApplication.shared.applicationState == .active else { completion?(); return }
            if ATTrackingManager.trackingAuthorizationStatus == .notDetermined {
                let status = await ATTrackingManager.requestTrackingAuthorization()
                AppLog.ui.info("att.status \(status.rawValue)")
                if status != .notDetermined { UserDefaults.standard.set(true, forKey: askedKey) }
            } else {
                // 이미 다른 경로로 결정돼 있었음(예: 설정에서 미리 허용/차단) — 다시 물을 필요 없음.
                UserDefaults.standard.set(true, forKey: askedKey)
            }
            completion?()
        }
    }
}
