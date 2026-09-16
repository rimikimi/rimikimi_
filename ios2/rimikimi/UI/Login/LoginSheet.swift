import SwiftUI
import AuthenticationServices

/// 로그인 시트 — 로고 · 문구 · Apple(네이티브) · 카카오 · 네이버 · Google. 웹 `LoginGate` 와 같은 문구·색.
struct LoginSheet: View {
    @Environment(AppState.self) private var app
    var message: String?

    var body: some View {
        VStack(spacing: Spacing.s4) {
            BrandLogo(height: 40).padding(.top, Spacing.s5)
            Text(message ?? "상상이 현실이 되는 곳")
                .font(AppFont.callout).foregroundStyle(Color.ink2).multilineTextAlignment(.center)

            VStack(spacing: Spacing.s3) {
                SignInWithAppleButton(.continue) { request in
                    app.auth.prepareApple(request)
                } onCompletion: { result in
                    Task { await app.auth.completeApple(result) }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: ControlHeight.button)
                .clipShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                .disabled(app.auth.busy != nil)

                ProviderButton(title: "카카오로 시작하기", systemImage: "message.fill",
                               background: Color(uiColor: UIColor(hex: 0xFEE500)), foreground: Color(uiColor: UIColor(hex: 0x191919)),
                               busy: app.auth.busy == .kakao) { Task { await app.auth.signIn(.kakao) } }
                ProviderButton(title: "네이버로 시작하기", systemImage: "n.square.fill",
                               background: Color(uiColor: UIColor(hex: 0x03C75A)), foreground: .white,
                               busy: app.auth.busy == .naver) { Task { await app.auth.signIn(.naver) } }
                ProviderButton(title: "Google로 시작하기", systemImage: "g.circle.fill",
                               background: Color.card, foreground: Color.ink, bordered: true,
                               busy: app.auth.busy == .google) { Task { await app.auth.signIn(.google) } }
            }
            .disabled(app.auth.busy != nil)

            if let err = app.auth.lastError {
                Text(err)
                    .font(AppFont.footnote).foregroundStyle(Color.accent)
                    .multilineTextAlignment(.center)
                    .padding(Spacing.s3)
                    .frame(maxWidth: .infinity)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: Radius.button, style: .continuous).strokeBorder(Color.accent.opacity(0.33)) }
            }

            Text("로그인하면 서비스 이용약관과 개인정보 처리방침에 동의하는 것으로 간주합니다.")
                .font(AppFont.caption).foregroundStyle(Color.ink3).multilineTextAlignment(.center)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.s5)
        .background(Color.bg)
    }
}

struct ProviderButton: View {
    var title: String
    var systemImage: String
    var background: Color
    var foreground: Color
    var bordered = false
    var busy = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s2) {
                Image(systemName: systemImage).font(.system(size: 16, weight: .semibold))
                Text(busy ? "이동 중…" : title)
            }
            .font(AppFont.headline)
            .frame(maxWidth: .infinity)
            .frame(height: ControlHeight.button)
            .background(background, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
            .overlay {
                if bordered { RoundedRectangle(cornerRadius: Radius.button, style: .continuous).strokeBorder(Color.separatorLine, lineWidth: 1.5) }
            }
            .foregroundStyle(foreground)
            .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.985))
    }
}
