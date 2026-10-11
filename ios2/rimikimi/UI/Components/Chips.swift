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
        .buttonStyle(.plain)
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
                // 할인 배지는 칩 밖에 겹쳐 띄우지 않고(2026-10-11 정리) 부제 줄에 붙인다 — "5 크레딧 · 17% 할인".
                if let line = [subtitle, badge].compactMap({ $0 }).joined(separator: " · ").nilIfEmpty {
                    Text(line).font(AppFont.caption).foregroundStyle(isActive || badge != nil ? Color.accent : Color.ink2)
                }
            }
            .padding(.horizontal, Spacing.s3 + 2)
            .frame(minWidth: 64)
            .frame(height: subtitle == nil && badge == nil ? ControlHeight.small : 48)
            // 리퀴드글래스(오너 지시 2026-10-09) — 고른 칩은 강조색으로 물든 유리.
            .glassEffect(isActive ? .regular.tint(Color.accent.opacity(0.22)).interactive() : .regular.interactive(),
                         in: Capsule())
            .foregroundStyle(isActive ? Color.accent : Color.ink)
            .contentShape(Capsule())
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

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
