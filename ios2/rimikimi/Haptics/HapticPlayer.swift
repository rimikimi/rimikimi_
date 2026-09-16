import UIKit

/// `v2/SPEC.md` §1 — 햅틱은 **확정 시점에만**(누를 때 X). Reduce Motion 과 무관하게 유지한다
/// (햅틱은 시각 모션이 아니다).
@MainActor
enum HapticPlayer {
    /// 만들기·저장처럼 되돌릴 수 없는 확정.
    static func commit() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    /// 옵션 확정(칩 선택이 실제로 값에 반영될 때).
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}
