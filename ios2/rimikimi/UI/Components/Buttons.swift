import SwiftUI

/// 누름 = scale 0.97 (전체폭 바 0.985) · 110ms in / 140ms out. 햅틱은 여기 없다 — 확정 시점에만.
struct PressScaleButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.97
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(configuration.isPressed ? Motion.pressDown : Motion.pressUp, value: configuration.isPressed)
    }
}

/// 주 버튼 — 50pt, 모서리 12, 강조색. 전체폭이라 0.985.
struct PrimaryButtonStyle: ButtonStyle {
    var isDisabled = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.headline).tracking(Tracking.headline)
            .frame(maxWidth: .infinity)
            .frame(height: ControlHeight.button)
            .background(isDisabled ? Color.fill : (configuration.isPressed ? Color.accentPressed : Color.accent),
                        in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
            .foregroundStyle(isDisabled ? Color.ink3 : Color.onAccent)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(configuration.isPressed ? Motion.pressDown : Motion.pressUp, value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
    }
}

/// 2차 버튼 — 회색 채움, 같은 높이. `small` 이면 36pt.
struct SecondaryButtonStyle: ButtonStyle {
    var small = false
    var fullWidth = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(small ? AppFont.footnote : AppFont.headline)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .padding(.horizontal, fullWidth ? 0 : Spacing.s4)
            .frame(height: small ? ControlHeight.small : ControlHeight.button)
            .background(configuration.isPressed ? Color.fillPressed : Color.fill,
                        in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
            .foregroundStyle(Color.ink)
            .scaleEffect(configuration.isPressed ? (fullWidth ? 0.985 : 0.97) : 1)
            .animation(configuration.isPressed ? Motion.pressDown : Motion.pressUp, value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
    }
}

/// 텍스트 버튼 — 투명, 눌리면 60%.
struct TextButtonStyle: ButtonStyle {
    var color: Color = .ink
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.calloutEmphasis)
            .foregroundStyle(color)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .animation(configuration.isPressed ? Motion.pressDown : Motion.pressUp, value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// 행 누름 하이라이트 — 리스트형 버튼.
struct RowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.fill : Color.clear)
            .contentShape(Rectangle())
    }
}
