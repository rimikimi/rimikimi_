import SwiftUI
import UIKit

/// `v2/SPEC.md` §1 토큰. 값은 전부 여기서만 나온다 — 뷰 코드는 `colorScheme` 으로 분기하지 않는다.
/// 다크 값이 명세에 없는 항목(회색 채움·구분선)은 라이트 값의 대비를 유지하는 쪽으로 정했다.
extension Color {
    // MARK: 바탕 · 카드
    /// 바탕 `#FBF8F3` (다크 `#17161A`)
    static let bg = Color.dynamic(light: UIColor(hex: 0xFBF8F3), dark: UIColor(hex: 0x17161A))
    /// 카드·행 `#FFFFFF` (다크 `#201E23`)
    static let card = Color.dynamic(light: UIColor(hex: 0xFFFFFF), dark: UIColor(hex: 0x201E23))
    /// 회색 채움(2차 버튼·칩) `#F1ECE4`
    static let fill = Color.dynamic(light: UIColor(hex: 0xF1ECE4), dark: UIColor(hex: 0x2A282E))
    /// 눌림 `#E4DCD0`
    static let fillPressed = Color.dynamic(light: UIColor(hex: 0xE4DCD0), dark: UIColor(hex: 0x38353D))

    // MARK: 글자
    /// 글자 `#231F20`
    static let ink = Color.dynamic(light: UIColor(hex: 0x231F20), dark: UIColor(hex: 0xF4F1EC))
    /// 2차 60%
    static let ink2 = Color.dynamic(light: UIColor(hex: 0x231F20, alpha: 0.60), dark: UIColor(hex: 0xF4F1EC, alpha: 0.60))
    /// 3차 30%
    static let ink3 = Color.dynamic(light: UIColor(hex: 0x231F20, alpha: 0.30), dark: UIColor(hex: 0xF4F1EC, alpha: 0.30))
    /// 구분선 `rgba(35,31,32,.14)`
    static let separatorLine = Color.dynamic(light: UIColor(hex: 0x231F20, alpha: 0.14), dark: UIColor(hex: 0xF4F1EC, alpha: 0.14))
    /// 강조 위에 올라가는 글자·아이콘.
    static let onAccent = Color.white
    /// 잉크 배경(가운데 카메라 원) 위 글자.
    static let onInk = Color.dynamic(light: UIColor(hex: 0xFBF8F3), dark: UIColor(hex: 0x17161A))

    // MARK: 강조
    /// 강조(탭 활성·주 버튼) `#E6403C`
    static let accent = Color(uiColor: UIColor(hex: 0xE6403C))
    /// 주 버튼 눌림 — 살짝 어둡게.
    static let accentPressed = Color(uiColor: UIColor(hex: 0xCF3632))
    /// 연하게 `rgba(230,64,60,.12)`
    static let accentTint = Color(uiColor: UIColor(hex: 0xE6403C, alpha: 0.12))

    // MARK: 하트 4색 — 카테고리 칩 활성에만 쓴다.
    static let heartRed = Color(uiColor: UIColor(hex: 0xE6403C))
    static let heartYellow = Color(uiColor: UIColor(hex: 0xF9C83C))
    static let heartBlue = Color(uiColor: UIColor(hex: 0x60C9DE))
    static let heartPurple = Color(uiColor: UIColor(hex: 0x8A5DA7))
    static let hearts: [Color] = [.heartRed, .heartYellow, .heartBlue, .heartPurple]
    /// 칩 i 번째의 활성색 (0 → 빨강, 1 → 노랑 …).
    static func heart(_ index: Int) -> Color { hearts[((index % 4) + 4) % 4] }

    /// 트레이트 기반 동적 색 — 에셋 카탈로그의 Any/Dark 쌍과 같은 것.
    static func dynamic(light: UIColor, dark: UIColor) -> Color {
        Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light })
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
}
