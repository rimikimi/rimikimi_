import SwiftUI
import PhotosUI

/// 프로필 — 크레딧 · 스토어 · 초대 · 알림 설정 · 등록 사진 · 계정 · 법적 고지.
struct ProfileView: View {
    @Environment(AppState.self) private var app
    @State private var confirmDelete = false
    @State private var deleting = false

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(spacing: Spacing.s4) {
                header
                if app.auth.isSignedIn {
                    CardGroup {
                        SettingsRow(title: Copy.creditsLabel, value: app.quota?.chipLabel ?? "–", systemImage: "ticket", chevron: false) {}
                        SettingsRow(title: Copy.store, value: Copy.storeValue, systemImage: "bag") { app.profilePath.append(.store) }
                        SettingsRow(title: Copy.inviteFriends, value: app.quota?.referralCode, systemImage: "gift") { app.profilePath.append(.invite) }
                    }
                    CardGroup {
                        NotificationToggleRow()
                    }
                    // build 90 실기기 결함 #3(오너 지시) — iOS 는 프로필에 등록 사진(내 사진) 항목이
                    // 없어 컨셉 옵션 화면(`OptionBlocks.MyPhotoCard`)에서만 바꿀 수 있었다(안드로이드
                    // `rn/.../profile.tsx` 의 "내 사진" 행과 어긋남, SPEC §6-6). 같은 문구로 미리보기·
                    // 변경·삭제를 프로필에도 추가.
                    CardGroup {
                        MyPhotoRow()
                        // 얼굴 스캔 — 각도 3장은 한 장보다 얼굴 재현이 정확하다(`_design/face-profile-v1.md`).
                        SettingsRow(title: app.faceProfile.hasProfile ? Copy.faceRescan : Copy.faceScan,
                                    value: app.faceProfile.hasProfile ? Copy.faceSavedCount(app.faceProfile.ordered.count) : nil,
                                    systemImage: "faceid") { app.showFaceScan = true }
                    }
                    CardGroup {
                        SettingsRow(title: Copy.account, value: providerLabel, systemImage: "person.crop.circle", chevron: false) {}
                        SettingsRow(title: Copy.signOut, systemImage: "rectangle.portrait.and.arrow.right", chevron: false) { app.signOut() }
                        SettingsRow(title: deleting ? Copy.deleting : Copy.deleteAccount, systemImage: "trash", chevron: false, destructive: true) { confirmDelete = true }
                    }
                } else {
                    VStack(spacing: Spacing.s3) {
                        Text(Copy.guestTitle).font(AppFont.headline)
                        Text(Copy.guestDesc)
                            .font(AppFont.callout).foregroundStyle(Color.ink2).multilineTextAlignment(.center)
                        Button(Copy.signIn) { app.loginMessage = nil; app.loginSheet = true }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                    .padding(Spacing.s4)
                    .frame(maxWidth: .infinity)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    .padding(.horizontal, Spacing.page)
                }
                CardGroup {
                    SettingsRow(title: Copy.terms, systemImage: "doc.text") { open(Config.termsURL, Copy.terms) }
                    SettingsRow(title: Copy.privacy, systemImage: "hand.raised") { open(Config.privacyURL, Copy.privacy) }
                    SettingsRow(title: Copy.refund, systemImage: "arrow.uturn.backward") { open(Config.refundURL, Copy.refund) }
                }
                VStack(spacing: 2) {
                    Text(Copy.bizLine1)
                    Text(Copy.bizLine2)
                    Text(Copy.bizLine3)
                }
                .font(AppFont.caption).foregroundStyle(Color.ink3).multilineTextAlignment(.center)
                .padding(.top, Spacing.s3)
                Color.clear.frame(height: 1).id("bottomAnchor")
            }
            .padding(.top, Spacing.s2)
            .padding(.bottom, app.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(Copy.tabProfile)
        .task(id: app.auth.session?.userID) { await app.refreshQuota() }
        .confirmationDialog(Copy.deleteConfirmTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(Copy.deleteAccount, role: .destructive) { deleteAccount() }
            Button(Copy.cancel, role: .cancel) {}
        } message: {
            Text(Copy.deleteConfirmMessage)
        }
        #if DEBUG
        // 결함 #4 검증 캡처용 — `dev/devsignin` 처럼 로그인 상태가 늦게(launch argument 처리 시점) 바뀌면
        // 카드가 여러 개 늘어나 콘텐츠 높이가 커지는데, 이미 확정된 초기 스크롤 위치는 그대로라 다시 잡아준다.
        .defaultScrollAnchor(app.devScrollToBottom ? .bottom : .top)
        .onChange(of: app.auth.isSignedIn) { _, _ in
            guard app.devScrollToBottom else { return }
            for delay in [0.2, 0.5, 0.9] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { proxy.scrollTo("bottomAnchor", anchor: .bottom) }
            }
        }
        #endif
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
        case "kakao": return Copy.providerKakao
        case "apple": return "Apple"
        case "email": return Copy.providerEmail
        default: return app.auth.session?.email?.hasSuffix("naver.com") == true ? Copy.providerNaver : Copy.providerEmail
        }
    }

    private func open(_ url: URL, _ title: String) { app.webTool = .init(url: url, title: title) }

    private func deleteAccount() {
        guard !deleting else { return }
        deleting = true
        Task {
            defer { deleting = false }
            // 오프라인이면 토큰을 못 받는다 — 이제 로그아웃되지 않으므로 이유를 알려준다.
            guard let token = await app.auth.validAccessToken() else {
                app.showToast(Copy.retryNetwork)
                return
            }
            do {
                try await RimikimiAPI.shared.deleteAccount(token: token)
                app.signOut()
                app.userPhoto.clear()
                app.showToast(Copy.deleteDone)
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
                Text(Copy.pushTitle).font(AppFont.body)
                Text(app.push.authorization == .denied ? Copy.pushDenied : Copy.pushDesc)
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

/// "내 사진" 행 — 등록 사진 미리보기 + 변경 + 삭제. 안드로이드 `rn/.../profile.tsx` 의
/// `copy.options.myPhoto`("내 사진") 문구와 맞추고, `UI/Concept/OptionBlocks.MyPhotoCard` 와 같은
/// 저장소(`app.userPhoto`)·같은 선택기(PhotosPicker)를 그대로 재사용한다(결함 #3, 오너 지시).
struct MyPhotoRow: View {
    @Environment(AppState.self) private var app
    @State private var pick: PhotosPickerItem?

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Thumb(image: app.userPhoto.image)
            VStack(alignment: .leading, spacing: 2) {
                Text(Copy.myPhoto).font(AppFont.body)
                Text(app.userPhoto.hasPhoto ? Copy.myPhotoSaved : Copy.myPhotoEmpty)
                    .font(AppFont.footnote).foregroundStyle(Color.ink2)
            }
            Spacer(minLength: Spacing.s2)
            if app.userPhoto.hasPhoto {
                Button(Copy.delete) { app.userPhoto.clear(); app.faceProfile.clear() }
                    .buttonStyle(TextButtonStyle(color: .accent))
            }
            PhotosPicker(selection: $pick, matching: .images, photoLibrary: .shared()) {
                Text(app.userPhoto.hasPhoto ? Copy.change : Copy.choose)
            }
            .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
        }
        .padding(.horizontal, Spacing.s4)
        .frame(minHeight: ControlHeight.row)
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let img = await PhotoLoader.image(from: item) { app.userPhoto.set(img); HapticPlayer.success() }
                pick = nil
            }
        }
    }
}
