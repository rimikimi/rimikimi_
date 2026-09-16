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
