import SwiftUI

/// `v2/SPEC.md` §1 타입 — 시스템 글꼴만(SF · Apple SD Gothic Neo). 브랜드 글꼴 없음.
/// 2026-10-11: 고정 pt 대신 **시스템 텍스트 스타일**(Dynamic Type 반응, 애플 앱과 같은 굵기 체계). 자간(Tracking)은 0 으로.
enum AppFont {
    static let title2 = Font.title2.weight(.bold)
    /// 홈 가로줄 제목 — 목업 `.rowh b` 20/700, 자간 -0.02em.
    static let sectionTitle = Font.title3.weight(.bold)
    /// 카드 제목 — 목업 `.card .t` 14/600.
    static let cardTitle = Font.subheadline.weight(.semibold)
    /// NEW 배지 — 11/700.
    static let badge = Font.caption2.weight(.bold)
    static let headline = Font.headline
    static let body = Font.body
    static let bodyEmphasis = Font.body.weight(.semibold)
    static let callout = Font.callout
    static let calloutEmphasis = Font.callout.weight(.semibold)
    static let footnote = Font.footnote
    static let caption = Font.caption2.weight(.semibold)
    /// 탭 라벨은 시스템 탭바가 정한다 — 여기선 가운데 카메라 원 아래 보조 라벨에만 쓴다.
    static let tabLabel = Font.caption2.weight(.semibold)
}

/// 크기 비례 자간 — 22pt 는 -0.015em, 17pt 는 -0.01em. 본문은 0.
enum Tracking {
    static let title2: CGFloat = 0
    static let headline: CGFloat = 0
    static let sectionTitle: CGFloat = 0
}
