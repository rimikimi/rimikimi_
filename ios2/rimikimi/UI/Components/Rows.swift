import SwiftUI

/// 흰 카드 안 행 묶음(구분선 0.5pt). 카드는 유리가 아니다.
struct CardGroup<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content()) { subviews in
                ForEach(subviews) { child in
                    child
                    if child.id != subviews.last?.id {
                        Rectangle().fill(Color.separatorLine).frame(height: 0.5).padding(.leading, Spacing.s4)
                    }
                }
            }
        }
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
    }
}

/// 제목 + 값/화살표 행.
struct SettingsRow: View {
    var title: String
    var value: String? = nil
    var systemImage: String? = nil
    var chevron = true
    var destructive = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(destructive ? Color.accent : Color.ink2)
                        .frame(width: 24)
                }
                Text(title).font(AppFont.body).foregroundStyle(destructive ? Color.accent : Color.ink)
                Spacer()
                if let value { Text(value).font(AppFont.callout).foregroundStyle(Color.ink2) }
                if chevron {
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink3)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .frame(minHeight: ControlHeight.row)
        }
        .buttonStyle(RowButtonStyle())
    }
}

/// 섹션 제목 — 17/600, 오른쪽에 "더보기 →" 선택.
struct SectionHeader: View {
    var title: String
    var trailing: String? = nil
    var trailingAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(AppFont.headline).tracking(Tracking.headline)
            Spacer()
            if let trailing, let trailingAction {
                Button(trailing, action: trailingAction).buttonStyle(TextButtonStyle(color: .ink2))
            }
        }
        .padding(.horizontal, Spacing.page)
        .padding(.top, Spacing.s5)
        .padding(.bottom, Spacing.s3)
        .accessibilityAddTraits(.isHeader)
    }
}
