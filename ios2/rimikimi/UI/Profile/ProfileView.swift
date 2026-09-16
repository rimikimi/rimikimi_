import SwiftUI

/// 프로필 — 크레딧 · 스토어 · 초대 · 알림 설정 · 계정 · 법적 고지. 1주차는 크레딧만 실데이터, 나머지는 자리.
struct ProfileView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.s4) {
                header
                if app.auth.isSignedIn {
                    CardGroup {
                        SettingsRow(title: "크레딧", value: app.quota?.chipLabel ?? "–", systemImage: "ticket", chevron: false) {}
                        SettingsRow(title: "스토어", value: "곧 열려요", systemImage: "bag") { app.creditsSheet = true }
                        SettingsRow(title: "친구 초대", value: app.quota?.referralCode, systemImage: "gift") { app.showToast("초대 화면은 다음 주에 붙어요") }
                    }
                    CardGroup {
                        SettingsRow(title: "새 컨셉 알림", value: "끄기", systemImage: "bell") { app.showToast("알림 설정은 다음 주에 붙어요") }
                    }
                    CardGroup {
                        SettingsRow(title: "계정", value: providerLabel, systemImage: "person.crop.circle", chevron: false) {}
                        SettingsRow(title: "로그아웃", systemImage: "rectangle.portrait.and.arrow.right", chevron: false) { app.signOut() }
                        SettingsRow(title: "계정 삭제", systemImage: "trash", chevron: false, destructive: true) { app.showToast("계정 삭제는 다음 주에 붙어요") }
                    }
                } else {
                    VStack(spacing: Spacing.s3) {
                        Text("로그인이 필요해요").font(AppFont.headline)
                        Text("로그인하면 크레딧, 내 갤러리, 친구 초대를 이용할 수 있어요.")
                            .font(AppFont.callout).foregroundStyle(Color.ink2).multilineTextAlignment(.center)
                        Button("로그인") { app.loginMessage = nil; app.loginSheet = true }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                    .padding(Spacing.s4)
                    .frame(maxWidth: .infinity)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    .padding(.horizontal, Spacing.page)
                }
                CardGroup {
                    SettingsRow(title: "이용약관", systemImage: "doc.text") { open("terms.html") }
                    SettingsRow(title: "개인정보처리방침", systemImage: "hand.raised") { open("privacy.html") }
                    SettingsRow(title: "환불정책", systemImage: "arrow.uturn.backward") { open("refund.html") }
                }
                VStack(spacing: 2) {
                    Text("상호: 리미키미 · 사업자등록번호: 247-01-03603")
                    Text("통신판매업신고: 2026-고양일산동-0326 · 경기 고양시 일산동구")
                    Text("문의: enquiry@rimikimi.com · 050-6988-2464")
                }
                .font(AppFont.caption).foregroundStyle(Color.ink3).multilineTextAlignment(.center)
                .padding(.top, Spacing.s3)
            }
            .padding(.top, Spacing.s2)
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle("프로필")
        .task(id: app.auth.session?.userID) { await app.refreshQuota() }
    }

    private var header: some View {
        HStack(spacing: Spacing.s3) {
            Avatar(url: app.auth.session?.avatarURL, size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(app.auth.displayLabel).font(AppFont.headline).lineLimit(1)
                if let email = app.auth.session?.email, email != app.auth.displayLabel {
                    Text(email).font(AppFont.footnote).foregroundStyle(Color.ink2).lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.horizontal, Spacing.page)
    }

    private var providerLabel: String {
        switch app.auth.session?.provider {
        case "google": return "Google"
        case "kakao": return "카카오"
        case "apple": return "Apple"
        case "email": return "이메일"
        default: return app.auth.session?.email?.hasSuffix("naver.com") == true ? "네이버" : "이메일"
        }
    }

    private func open(_ page: String) {
        app.webTool = .init(url: Config.apiBase.appendingPathComponent(page), title: "법적 고지")
    }
}

/// 크레딧 부족 시트 — 팩 3개 · 구독 1개 · "친구 초대로 무료 3장". 결제(RevenueCat)는 다음 주.
struct CreditsShortSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            HStack {
                Text("크레딧이 부족해요").font(AppFont.title2).tracking(Tracking.title2)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                        .frame(width: 30, height: 30).background(Color.fill, in: Circle())
                }
                .buttonStyle(.plain).accessibilityLabel("닫기")
            }
            CardGroup {
                SettingsRow(title: "인트로 팩", value: "6 크레딧") {}
                SettingsRow(title: "스탠다드 팩", value: "24 크레딧") {}
                SettingsRow(title: "프로 팩", value: "45 크레딧") {}
            }
            .padding(.horizontal, -Spacing.page)
            CardGroup {
                SettingsRow(title: "rimikimi 플러스 구독", value: "매월") {}
            }
            .padding(.horizontal, -Spacing.page)
            Button("친구 초대로 무료 3장") {}
                .buttonStyle(SecondaryButtonStyle())
            Text("결제는 곧 열려요. 구매 즉시 하던 생성이 이어져요.").font(AppFont.footnote).foregroundStyle(Color.ink2)
            Spacer(minLength: 0)
        }
        .padding(Spacing.page)
        .background(Color.bg)
    }
}
