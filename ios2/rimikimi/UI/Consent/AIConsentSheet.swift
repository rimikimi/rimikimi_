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
    var onAgree: () -> Void
    var onCancel: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                Text("사진은 이렇게 쓰여요")
                    .font(AppFont.title2).tracking(Tracking.title2)

                VStack(alignment: .leading, spacing: Spacing.s3) {
                    ConsentRow(icon: "sparkles", text: "이 서비스는 인공지능(Google Gemini API)으로 이미지를 생성해요.")
                    ConsentRow(icon: "arrow.up.right.circle", text: "업로드한 사진은 이미지를 생성할 때만 Google로 전송되고, 서버에 저장하지 않아요 — 처리 후 즉시 폐기돼요.")
                    ConsentRow(icon: "iphone", text: "등록해 둔 얼굴 참조사진은 이용자 기기에만 저장돼요. 생성할 때만 함께 전송돼요.")
                }

                Button {
                    app.webTool = .init(url: Config.privacyURL, title: "개인정보처리방침")
                } label: {
                    Text("개인정보처리방침에서 자세히 보기")
                        .font(AppFont.footnote).foregroundStyle(Color.accent)
                }
                .buttonStyle(.plain)

                VStack(spacing: Spacing.s2) {
                    Button("동의하고 계속", action: onAgree)
                        .buttonStyle(PrimaryButtonStyle(isDisabled: false))
                    Button("다음에", action: onCancel)
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
