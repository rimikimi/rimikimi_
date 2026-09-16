import SwiftUI

/// `v2/SPEC.md` §1 — 여백·모서리·높이. 호출부에 생 숫자를 쓰지 않는다.
enum Spacing {
    static let s1: CGFloat = 4
    static let s2: CGFloat = 8
    static let s3: CGFloat = 12
    static let s4: CGFloat = 16
    static let s5: CGFloat = 24
    static let s6: CGFloat = 32
    /// 화면 좌우 여백 16
    static let page: CGFloat = 16
}

enum Radius {
    static let button: CGFloat = 12
    static let card: CGFloat = 14
    static let sheet: CGFloat = 20
    static let chip: CGFloat = 999
    static let thumb: CGFloat = 10
}

enum ControlHeight {
    /// 버튼 50 (작은 것 36)
    static let button: CGFloat = 50
    static let small: CGFloat = 36
    static let chip: CGFloat = 34
    static let row: CGFloat = 52
    static let avatar: CGFloat = 32
}

/// 탭바 — 높이 62 · 하단 14 · 좌우 12 · 가운데 카메라 원 54(위로 14 띄움).
/// iOS 26 네이티브 탭바가 자기 크기를 정하므로, 이 값은 카메라 원과 콘텐츠 하단 여백에만 쓴다.
enum TabBarMetrics {
    static let height: CGFloat = 62
    static let bottom: CGFloat = 14
    static let sideMargin: CGFloat = 12
    static let cameraSize: CGFloat = 54
    static let cameraRaise: CGFloat = 14
    /// 탭 화면 스크롤 콘텐츠의 하단 여백 (탭바 아래로 흘러 들어가되 마지막 줄이 가려지지 않게)
    static let contentBottomPad: CGFloat = 24
}

/// 갤러리 카드 비율 — 컨셉 썸네일은 3:4.
enum CardMetrics {
    static let railCardWidth: CGFloat = 150
    static let bigRailCardWidth: CGFloat = 200
    static let aspect: CGFloat = 3.0 / 4.0
}
