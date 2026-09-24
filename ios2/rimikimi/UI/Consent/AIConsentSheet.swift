import SwiftUI

/// 제3자 AI(Google Gemini) 전송 고지 — 첫 "만들기" 전 1회만(Apple 5.1.1(i)/5.1.2(i), AI기본법 §31
/// 사전고지). 컴플라이언스 리뷰로 발견: `privacy.html`에는 이미 정확한 문구가 있었지만 앱 안에서
/// 실행 전에 보여주고 동의를 받는 화면이 없었다 — 정책 문서에만 적어 두는 걸로는 부족하다는 게
/// 앞서 다른 앱 리젝 이력(`APPSTORE_SUBMIT_RUNBOOK.md` §14-7)의 요지였다.
///
/// ⚠️ **1회만** — `AppState.aiConsentGiven`(UserDefaults)에 동의를 기록하고, 이후 생성부터는 이
/// 시트를 다시 띄우지 않는다(오너 지시 2026-09-19: 매 생성마다 묻지 않을 것). 사진 생성이 앱의
/// 핵심 기능이라 "거부해도 계속 이용 가능"한 대체 경로는 없다 — 다음에를 누르면 이번 생성만
/// 취소되고, 다시 만들기를 누르면 같은 시트가 또 뜬다.
struct AIConsentSheet: View {
    @Environment(AppState.self) private var app
    // ⚠️ 재검증으로 발견(2026-09-19): `app.webTool`(fullScreenCover)은 `RootTabView`의 같은
    // 프레젠터에 이미 떠 있는 **이 시트 위**로는 못 뜬다(UIKit 은 프레젠터당 모달 1개) — 조용히
    // 무시된다. 시트 안에서는 항상 뜨는 시스템 브라우저(`openURL`)로 연다.
    @Environment(\.openURL) private var openURL
    var onAgree: () -> Void
    var onCancel: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                Text(Copy.consentTitle)
                    .font(AppFont.title2).tracking(Tracking.title2)

                VStack(alignment: .leading, spacing: Spacing.s3) {
                    ConsentRow(icon: "sparkles", text: Copy.consentAI)
                    ConsentRow(icon: "arrow.up.right.circle", text: Copy.consentUpload)
                    ConsentRow(icon: "iphone", text: Copy.consentDevice)
                }

                Button {
                    openURL(Config.privacyURL)
                } label: {
                    Text(Copy.consentPrivacyLink)
                        .font(AppFont.footnote).foregroundStyle(Color.accent)
                }
                .buttonStyle(.plain)

                VStack(spacing: Spacing.s2) {
                    Button(Copy.consentAgree, action: onAgree)
                        .buttonStyle(PrimaryButtonStyle(isDisabled: false))
                    Button(Copy.consentLater, action: onCancel)
                        .buttonStyle(TextButtonStyle(color: .ink2))
                }
                .padding(.top, Spacing.s2)
            }
            .padding(Spacing.page)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
    }
}

private struct ConsentRow: View {
    var icon: String
    var text: String
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.accent)
                .frame(width: 22)
            Text(text)
                .font(AppFont.callout).foregroundStyle(Color.ink2)
        }
    }
}
