import SwiftUI

/// 유리 재질은 **탭바·상단 바에만**(SPEC §0). 카드·리스트엔 쓰지 않는다.
/// 상단 바 위의 둥근 버튼 하나만 여기서 만든다 — 결과 화면 닫기 등.
struct GlassCircleButton: View {
    var systemImage: String
    var label: String
    var size: CGFloat = 40
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.ink)
                .frame(width: size, height: size)
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.94))
        .glassEffect(.regular.interactive(), in: Circle())
        .accessibilityLabel(label)
    }
}

/// 상단 바 제목 — 안쪽 화면은 가운데 작은 제목(Large Title 없음).
extension View {
    func inlineTitle(_ title: String) -> some View {
        navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}

/// 사진 앱식 확대 전환(iOS 18+ `.zoom`)을 쓰기 위한 공용 네임스페이스.
/// 격자(출발지)와 브라우저(도착지)가 서로 다른 파일·다른 화면이라 `@Namespace` 를 직접 넘길 수 없어
/// 스택 뿌리(`RootTabView`)에서 만들어 환경으로 내려 준다.
private struct ZoomNamespaceKey: EnvironmentKey { static let defaultValue: Namespace.ID? = nil }
extension EnvironmentValues {
    var zoomNamespace: Namespace.ID? {
        get { self[ZoomNamespaceKey.self] }
        set { self[ZoomNamespaceKey.self] = newValue }
    }
}

extension View {
    /// 확대 전환의 출발 셀.
    @ViewBuilder func zoomSource(_ id: String, in ns: Namespace.ID?) -> some View {
        if let ns { matchedTransitionSource(id: id, in: ns) } else { self }
    }
    /// 확대 전환의 도착 화면. 아래로 끌어내리면 원래 셀로 되돌아가는 **네이티브 사진 앱과 같은**
    /// 상호작용(끌기 중 축소 → 놓으면 복귀/닫힘)이 여기에 딸려 온다 — 직접 구현한 게 아니라
    /// 시스템 전환이라 모션 곡선도 애플 것 그대로다(오너 지시 2026-09-22).
    @ViewBuilder func zoomDestination(_ id: String, in ns: Namespace.ID?) -> some View {
        if let ns { navigationTransition(.zoom(sourceID: id, in: ns)) } else { self }
    }
}
