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

/// 탭바 — 높이 62 · 하단 14 · 좌우 12 · 가운데 카메라 원 54.
/// iOS 26 네이티브 탭바가 자기 크기를 정하므로, 이 값은 카메라 원과 콘텐츠 하단 여백에만 쓴다.
enum TabBarMetrics {
    static let height: CGFloat = 62
    static let bottom: CGFloat = 14
    static let sideMargin: CGFloat = 12
    static let cameraSize: CGFloat = 54
    /// build 90 실기기 결함 #2(오너 지시) — 예전엔 `bottom + 14` 고정 pt 로 카메라 원을 띄웠는데, 실제
    /// 탭바는 iOS 가 그리는 떠 있는 탭바라 기기마다(홈 인디케이터 유무) 위치가 달라 실기기에서 원이
    /// 공중에 분리돼 보였다(시뮬레이터에선 우연히 맞아 보였음). 지금은 `RootTabView.TabBarFrameReader` 가
    /// 실측한 탭바 상단 Y 좌표를 기준으로 배치하고, 이 값은 그 위에 원이 "살짝 겹쳐 떠 있는" 정도(SPEC §1)
    /// 로만 쓴다 — 탭바 위 절대 여백이 아니다.
    static let cameraOverlap: CGFloat = 10
    /// 탭바 프레임을 아직 측정하지 못했을 때(첫 프레임)의 폴백 — 이전 고정값과 동일하게 둬서 깜빡임 최소화.
    // 오너 스크린샷 실측(2026-09-17): 원 중심이 탭바 알약 중심보다 36pt 위에 떠 있었다.
    /// 알약 가운데 빈 슬롯에 들어앉도록 그만큼 내린다. 음수는 정상 — 이 오버레이의 기준은
    /// **안전영역 아래**인데 떠 있는 탭바는 안전영역보다 더 아래까지 내려오기 때문이다.
    static let cameraFallbackBottom: CGFloat = -8
    /// 탭바가 없는(푸시된) 화면의 하단 여백, 그리고 탭바 실측 전(첫 프레임) `AppState.contentBottomPad`
    /// 의 폴백값. **탭바가 실제로 떠 있는 탭 루트 화면**(갤러리·필터·내 사진·프로필)에서는 이 고정값 대신
    /// `AppState.contentBottomPad`(탭바 프레임 실측, 결함 #4 재작업 — 오너 지시)를 써야 한다. 고정 24pt로는
    /// 탭바(높이 62 + 하단 14 + 안전영역)에 마지막 콘텐츠가 가려진다 — `UI/Filter/` 는 이번 작업 범위 밖이라
    /// 그대로 두었으니 필터 작업자가 같은 방식으로 옮겨야 한다.
    static let contentBottomPad: CGFloat = 120
}

/// 갤러리 카드 비율 — 컨셉 썸네일은 3:4.
enum CardMetrics {
    /// 가로줄 카드 폭 — 화면의 약 41% (160pt @390, 목업 `.card{flex:0 0 160px}`).
    static let railCardFraction: CGFloat = 160.0 / 390.0
    static let railGap: CGFloat = 10
    static let railBottom: CGFloat = 18
    static let aspect: CGFloat = 3.0 / 4.0
}
