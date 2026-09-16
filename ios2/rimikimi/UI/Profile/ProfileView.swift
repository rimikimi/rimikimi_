import SwiftUI

/// 프로필 — 크레딧 · 스토어 · 초대 · 알림 설정 · 계정 · 법적 고지.
struct ProfileView: View {
    @Environment(AppState.self) private var app
    @State private var confirmDelete = false
    @State private var deleting = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.s4) {
                header
                if app.auth.isSignedIn {
                    CardGroup {
                        SettingsRow(title: "크레딧", value: app.quota?.chipLabel ?? "–", systemImage: "ticket", chevron: false) {}
                        SettingsRow(title: "스토어", value: "충전 · 구독", systemImage: "bag") { app.profilePath.append(.store) }
                        SettingsRow(title: "친구 초대", value: app.quota?.referralCode, systemImage: "gift") { app.profilePath.append(.invite) }
                    }
                    CardGroup {
                        NotificationToggleRow()
                    }
                    CardGroup {
                        SettingsRow(title: "계정", value: providerLabel, systemImage: "person.crop.circle", chevron: false) {}
                        SettingsRow(title: "로그아웃", systemImage: "rectangle.portrait.and.arrow.right", chevron: false) { app.signOut() }
                        SettingsRow(title: deleting ? "삭제 중…" : "계정 삭제", systemImage: "trash", chevron: false, destructive: true) { confirmDelete = true }
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
                    SettingsRow(title: "이용약관", systemImage: "doc.text") { open(Config.termsURL, "이용약관") }
                    SettingsRow(title: "개인정보처리방침", systemImage: "hand.raised") { open(Config.privacyURL, "개인정보처리방침") }
                    SettingsRow(title: "환불정책", systemImage: "arrow.uturn.backward") { open(Config.refundURL, "환불정책") }
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
        .confirmationDialog("정말 계정을 삭제할까요?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("계정 삭제", role: .destructive) { deleteAccount() }
            Button("취소", role: .cancel) {}
        } message: {
            Text("생성한 이미지·크레딧·모든 데이터가 영구 삭제되며 되돌릴 수 없어요.")
        }
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

    private func open(_ url: URL, _ title: String) { app.webTool = .init(url: url, title: title) }

    private func deleteAccount() {
        guard !deleting else { return }
        deleting = true
        Task {
            defer { deleting = false }
            guard let token = await app.auth.validAccessToken() else { return }
            do {
                try await RimikimiAPI.shared.deleteAccount(token: token)
                app.signOut()
                app.userPhoto.clear()
                app.showToast("계정이 삭제됐어요. 그동안 이용해 주셔서 감사합니다.")
            } catch {
                app.showToast(error.localizedDescription)
            }
        }
    }
}

/// "새 컨셉 알림" 토글 — 알림 권한은 여기서만 묻는다(SPEC §3).
struct NotificationToggleRow: View {
    @Environment(AppState.self) private var app
    @State private var busy = false

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Image(systemName: "bell").font(.system(size: 16, weight: .medium)).foregroundStyle(Color.ink2).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text("새 컨셉 알림").font(AppFont.body)
                Text(app.push.authorization == .denied ? "설정에서 알림이 꺼져 있어요" : "매일 저녁 8시 새 컨셉이 오면 알려드려요")
                    .font(AppFont.footnote).foregroundStyle(Color.ink2)
            }
            Spacer()
            Toggle("", isOn: Binding(get: { app.push.newConceptAlerts }, set: { on in
                guard !busy else { return }
                busy = true
                Task { await app.push.setNewConceptAlerts(on); busy = false }
            }))
            .labelsHidden()
            .tint(Color.accent)
        }
        .padding(.horizontal, Spacing.s4)
        .frame(minHeight: ControlHeight.row)
    }
}
