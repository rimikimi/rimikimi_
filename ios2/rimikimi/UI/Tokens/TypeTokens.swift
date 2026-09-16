import SwiftUI

/// `v2/SPEC.md` §1 타입 — 시스템 글꼴만(SF · Apple SD Gothic Neo). 브랜드 글꼴 없음.
/// Title2 22/700 · Headline 17/600 · Body 17 · Callout 15 · Footnote 13/500 · Caption 11/600
enum AppFont {
    static let title2 = Font.system(size: 22, weight: .bold)
    static let headline = Font.system(size: 17, weight: .semibold)
    static let body = Font.system(size: 17)
    static let bodyEmphasis = Font.system(size: 17, weight: .semibold)
    static let callout = Font.system(size: 15)
    static let calloutEmphasis = Font.system(size: 15, weight: .semibold)
    static let footnote = Font.system(size: 13, weight: .medium)
    static let caption = Font.system(size: 11, weight: .semibold)
    /// 탭 라벨은 시스템 탭바가 정한다 — 여기선 가운데 카메라 원 아래 보조 라벨에만 쓴다.
    static let tabLabel = Font.system(size: 10, weight: .semibold)
}

/// 크기 비례 자간 — 22pt 는 -0.015em, 17pt 는 -0.01em. 본문은 0.
enum Tracking {
    static let title2: CGFloat = 22 * -0.015
    static let headline: CGFloat = 17 * -0.01
}
