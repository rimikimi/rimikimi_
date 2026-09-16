import SwiftUI

/// `v2/SPEC.md` §1 — 앱의 모션 어휘. transform/opacity 만, 종료는 진입보다 빠르게.
/// 푸시/팝/탭 전환은 시스템 기본(네이티브)이라 여기 없다.
enum Motion {
    // MARK: 시간(초)
    /// 진입 260 / 종료 160
    static let enter: Double = 0.26
    static let exit: Double = 0.16
    /// 누름 110ms in / 140ms out
    static let pressIn: Double = 0.11
    static let pressOut: Double = 0.14
    /// 시트 열림 320 · 닫힘 220
    static let sheetOpen: Double = 0.32
    static let sheetClose: Double = 0.22
    static let reduced: Double = 0.16

    // MARK: 곡선
    /// 명세 곡선 (0.32,0.72,0,1)
    static func easeIOS(_ d: Double = enter) -> Animation { .timingCurve(0.32, 0.72, 0, 1, duration: d) }
    static func easeOut(_ d: Double = enter) -> Animation { .timingCurve(0.23, 1, 0.32, 1, duration: d) }
    static func exitCurve(_ d: Double = exit) -> Animation { .timingCurve(0.3, 0, 1, 1, duration: d) }
    /// 누름: 눌릴 때 110ms, 뗄 때 140ms — `PressScale` 에서 방향별로 고른다.
    static let pressDown: Animation = .easeOut(duration: pressIn)
    static let pressUp: Animation = .easeOut(duration: pressOut)
    /// Reduce Motion — 크로스페이드만.
    static let reducedFade: Animation = .easeInOut(duration: reduced)

    static func pick(_ animation: Animation, reduceMotion: Bool) -> Animation {
        reduceMotion ? reducedFade : animation
    }
}
