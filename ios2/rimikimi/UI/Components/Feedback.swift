import SwiftUI

/// 빈 상태 — 문장 + 채우는 방법 버튼. 임의 일러스트 없음.
struct EmptyState: View {
    var message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: Spacing.s4) {
            Text(message)
                .font(AppFont.body)
                .foregroundStyle(Color.ink2)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
            }
        }
        .padding(.horizontal, Spacing.page)
        .padding(.top, 96)
        .frame(maxWidth: .infinity)
    }
}

/// 결정형 로딩 — 스켈레톤(1.2s 시머, Reduce Motion 이면 정지).
struct SkeletonBlock: View {
    var cornerRadius: CGFloat = Radius.card
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.fill)
            .overlay {
                if !reduceMotion {
                    GeometryReader { geo in
                        LinearGradient(colors: [.clear, Color.card.opacity(0.7), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: geo.size.width)
                            .offset(x: phase * geo.size.width)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = 1 }
            }
            .accessibilityLabel("불러오는 중")
    }
}

/// 비차단 토스트 — 상단 유리 캡슐(상단 바 영역이라 유리 허용). 진입 260 / 종료 160.
struct ToastModifier: ViewModifier {
    @Binding var message: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let message {
                Text(message)
                    .font(AppFont.calloutEmphasis)
                    .foregroundStyle(Color.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.s4).padding(.vertical, Spacing.s2 + 2)
                    .glassEffect(.regular, in: Capsule())
                    .padding(.top, Spacing.s2)
                    .padding(.horizontal, Spacing.page)
                    .transition(reduceMotion ? .opacity : .offset(y: -24).combined(with: .opacity))
                    .onTapGesture { self.message = nil }
                    .task(id: message) {
                        try? await Task.sleep(nanoseconds: 2_600_000_000)
                        guard !Task.isCancelled else { return }
                        self.message = nil
                    }
            }
        }
        .animation(message == nil ? Motion.exitCurve() : Motion.easeOut(), value: message)
    }
}

extension View {
    func toast(_ message: Binding<String?>) -> some View { modifier(ToastModifier(message: message)) }
}

/// 진입 스태거 — opacity + 8pt 위로. Reduce Motion 이면 opacity 만.
struct StaggerIn: ViewModifier {
    var delay: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 8)
            .onAppear {
                withAnimation(reduceMotion ? Motion.reducedFade : Motion.easeOut().delay(delay)) { shown = true }
            }
    }
}
extension View {
    func staggerIn(delay: Double = 0) -> some View { modifier(StaggerIn(delay: delay)) }
}
