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
                        // 아이폰 설정 앱처럼 구분선은 글자 시작점부터(아이콘 밑은 비운다).
                        Rectangle().fill(Color.separatorLine).frame(height: 0.5).padding(.leading, Spacing.s4 + 24 + Spacing.s3)
                    }
                }
            }
        }
        // iOS 26 기본 목록(insetGrouped)과 같은 큰 모서리(2026-10-11 "애플이 만든 앱처럼").
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.group, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: Radius.group, style: .continuous))
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
                if let value { Text(value).font(AppFont.body).foregroundStyle(Color.ink2).lineLimit(1) }
                if chevron {
                    Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(uiColor: .tertiaryLabel))
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
