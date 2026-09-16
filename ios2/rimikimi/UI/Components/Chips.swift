import SwiftUI

/// 카테고리 칩 — 회색 채움, 활성이면 하트 4색 중 하나(칩 순서대로). 모서리 999.
struct CategoryChip: View {
    var title: String
    var isActive: Bool
    var heartIndex: Int
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(AppFont.footnote)
                .lineLimit(1)
                .padding(.horizontal, Spacing.s3 + 2)
                .frame(height: ControlHeight.chip)
                .background(isActive ? Color.heart(heartIndex) : Color.fill, in: Capsule())
                .foregroundStyle(isActive ? Color.white : Color.ink)
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}

/// 옵션 칩(장수·스타일) — 활성은 강조색 연하게 + 강조 글자.
struct OptionChip: View {
    var title: String
    var subtitle: String? = nil
    var badge: String? = nil
    var isActive: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 1) {
                Text(title).font(AppFont.calloutEmphasis)
                if let subtitle {
                    Text(subtitle).font(AppFont.caption).foregroundStyle(isActive ? Color.accent : Color.ink2)
                }
            }
            .padding(.horizontal, Spacing.s3 + 2)
            .frame(minWidth: 64)
            .frame(height: subtitle == nil ? ControlHeight.small : 48)
            .background(isActive ? Color.accentTint : Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.button, style: .continuous)
                    .strokeBorder(isActive ? Color.accent : Color.clear, lineWidth: 1.5)
            }
            .overlay(alignment: .topTrailing) {
                if let badge {
                    Text(badge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(Color.accent, in: Capsule())
                        .offset(x: 6, y: -8)
                }
            }
            .foregroundStyle(isActive ? Color.accent : Color.ink)
            .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}

/// 두 갈래 세그먼트(거울셀카 / 일상컷).
struct SegmentedPair: View {
    var options: [(key: String, label: String)]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.key) { opt in
                let on = opt.key == selection
                Button {
                    guard !on else { return }
                    selection = opt.key
                    HapticPlayer.selection()
                } label: {
                    Text(opt.label)
                        .font(AppFont.calloutEmphasis)
                        .frame(maxWidth: .infinity)
                        .frame(height: ControlHeight.small - 4)
                        .background(on ? Color.card : Color.clear, in: RoundedRectangle(cornerRadius: Radius.button - 3, style: .continuous))
                        .foregroundStyle(on ? Color.ink : Color.ink2)
                        .shadow(color: on ? .black.opacity(0.06) : .clear, radius: 3, y: 1)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
    }
}
