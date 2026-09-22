import SwiftUI
import UIKit

/// 사진 그리드의 핀치 확대/축소 — UIKit `UIPinchGestureRecognizer` 를 그대로 쓴다.
///
/// **왜 SwiftUI `MagnifyGesture` 를 버렸나** (오너 지적 2026-09-22: "핀치줌이 엄지랑 검지일 때는
/// 되는데 왜 다른 손가락으로 하면 안 됨? 두 손가락 터치 시점에 딜레이가 아예 없는거 아님?")
/// — 오너 진단이 맞다. 문제는 확대 계산이 아니라 **제스처 인식 경합**이었다. `MagnifyGesture` 를
/// `.gesture()` 로 붙이면 스크롤뷰의 팬 제스처와 셀의 `NavigationLink` 버튼이 먼저 터치를 가져간다.
/// 첫 손가락이 닿고 **두 번째 손가락이 닿기 전에** 조금이라도 움직이면 그 순간 스크롤이 확정돼,
/// 뒤늦게 두 번째 손가락이 닿아도 확대는 시작조차 못 한다. 엄지+검지는 두 손가락이 거의 동시에
/// 닿아서 우연히 통과했던 것이고, 검지+중지처럼 시차가 생기는 조합은 매번 스크롤로 먹혔다.
///
/// UIKit 핀치는 두 번째 터치가 닿는 순간 시작되고, delegate 에서 **동시 인식**을 허용하면
/// 스크롤과 나란히 살아 있으므로 손가락 조합·닿는 순서와 무관하게 잡힌다.
///
/// 열 수 전환은 손을 뗄 때가 아니라 **문턱을 넘는 즉시**(`.changed`) 일어난다 — 네이티브 사진 앱도
/// 핀치 도중에 열 수가 바뀐다. 한 번 바뀌면 배율을 1로 리셋해, 손을 뗀 채로 있지 않아도 계속
/// 벌리면 다음 단계로 이어진다.
@available(iOS 18.0, *)
struct PinchColumnsGesture: UIGestureRecognizerRepresentable {
    /// 두 번째 손가락이 닿아 핀치가 시작된 순간.
    var onBegan: () -> Void = {}
    /// 핀치가 도는 **동안** 매 프레임 — 지금 배율(문턱 기준 1.0 부근).
    var onProgress: (CGFloat) -> Void = { _ in }
    /// 문턱을 넘은 순간 1회 — `true` 면 벌린 것(더 크게 = 적은 열), `false` 면 오므린 것(더 촘촘히).
    var onStep: (Bool) -> Void
    /// 손을 뗐을 때(또는 취소) — 진행 중 배율을 되돌린다.
    var onEnd: () -> Void = {}

    /// 문턱. 사진 앱처럼 "조금 벌린 것"에는 반응하지 않되, 한 번의 자연스러운 핀치로는 확실히 넘는 값.
    private static let zoomIn: CGFloat = 1.25
    private static let zoomOut: CGFloat = 0.8

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        /// **스크롤과는** 동시에 인식되게 한다 — 손가락 조합·닿는 순서와 무관하게 핀치가 살아 있으려면
        /// 스크롤의 팬 제스처와 나란히 굴러야 한다.
        func gestureRecognizer(_ g: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer
        }

        /// **탭은** 핀치가 실패한 뒤에야 성립한다. 이게 없으면 두 손가락 중 하나를 떼는 순간
        /// 그 지점이 탭으로 잡혀 엉뚱한 사진이 열리고, 손가락 밑 칸이 눌린 것처럼 반짝인다
        /// (오너 지적 2026-09-22 "마지막 손가락 포지션을 터치한 걸로 인식하는건 안 고칠거냐").
        func gestureRecognizer(_ g: UIGestureRecognizer,
                               shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            !(other is UIPanGestureRecognizer)
        }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPinchGestureRecognizer {
        let g = UIPinchGestureRecognizer()
        g.delegate = context.coordinator
        return g
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPinchGestureRecognizer, context: Context) {
        switch recognizer.state {
        case .began:
            recognizer.scale = 1
            onBegan()
        case .changed:
            if recognizer.scale >= Self.zoomIn {
                recognizer.scale = 1
                onStep(true)
            } else if recognizer.scale <= Self.zoomOut {
                recognizer.scale = 1
                onStep(false)
            } else {
                onProgress(recognizer.scale)
            }
        case .ended, .cancelled, .failed:
            onEnd()
        default:
            break
        }
    }
}
