import SwiftUI
import UIKit

/// 친구 초대 — 내 코드(탭해서 복사 · 공유) + 친구 코드 입력(`POST /api/referral/claim`).
struct InviteView: View {
    @Environment(AppState.self) private var app
    @State private var friendCode = ""
    @State private var claiming = false

    private var myCode: String? { app.quota?.referralCode }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text(Copy.inviteHeadline).font(AppFont.headline)
                    Text(Copy.inviteDesc(app.quota?.referralCount ?? 0))
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                }
                .padding(Spacing.s4).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))

                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text(Copy.inviteMyCode).font(AppFont.footnote).foregroundStyle(Color.ink2)
                    Button {
                        guard let c = myCode else { return }
                        UIPasteboard.general.string = c
                        HapticPlayer.success()
                        app.showToast(Copy.inviteCodeCopied)
                    } label: {
                        HStack {
                            Text(myCode ?? "–").font(.system(size: 28, weight: .bold, design: .rounded)).tracking(2)
                            Spacer()
                            Text(Copy.inviteTapToCopy).font(AppFont.footnote).foregroundStyle(Color.ink2)
                        }
                        .padding(Spacing.s4)
                        .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                    }
                    .buttonStyle(PressScaleButtonStyle(scale: 0.985))
                    if let c = myCode {
                        ShareLink(item: Config.inviteURL(code: c),
                                  message: Text(Copy.inviteShareText)) {
                            Label(Copy.shareAction, systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                }
                .padding(Spacing.s4)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))

                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text(Copy.inviteEnterCode).font(AppFont.footnote).foregroundStyle(Color.ink2)
                    HStack(spacing: Spacing.s2) {
                        TextField(Copy.inviteCodePlaceholder, text: $friendCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(AppFont.body)
                            .padding(.horizontal, Spacing.s3)
                            .frame(height: ControlHeight.button)
                            .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                        Button(claiming ? "…" : Copy.inviteApply) { claim() }
                            .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                            .disabled(claiming || friendCode.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    Text(Copy.inviteCodeHelp).font(AppFont.caption).foregroundStyle(Color.ink3)
                }
                .padding(Spacing.s4)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            }
            .padding(.horizontal, Spacing.page)
            .padding(.top, Spacing.s3)
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(Copy.inviteFriends)
        .toolbar(.hidden, for: .tabBar)
        .task { if app.quota == nil { await app.refreshQuota() } }
    }

    private func claim() {
        let code = friendCode.trimmingCharacters(in: .whitespaces).uppercased()
        guard !code.isEmpty, !claiming else { return }
        claiming = true
        Task {
            defer { claiming = false }
            guard let token = await app.auth.validAccessToken() else { app.handleNoToken(); return }
            do {
                let r = try await RimikimiAPI.shared.referralClaim(code: code, token: token)
                if r.ok {
                    HapticPlayer.success()
                    app.showToast(Copy.inviteOk)
                    friendCode = ""
                    await app.refreshQuota()
                } else {
                    app.showToast(Self.failMessage(r.reason))
                }
            } catch {
                app.showToast(error.localizedDescription)
            }
        }
    }

    /// `invite.codeFail.*` (i18nStrings ko)
    static func failMessage(_ reason: String?) -> String {
        switch reason {
        case "invalid_code", "invalid_ref": return Copy.inviteErrInvalid
        case "code_not_found", "ref_not_found": return Copy.inviteErrNotFound
        case "self_referral": return Copy.inviteErrSelf
        case "already_referred": return Copy.inviteErrAlready
        default: return Copy.inviteErrRetry
        }
    }
}

/// 홈 상단 초대 카드 — 결함 #5(오너 지시): 1.x 처럼 홈 맨 위에 상시 노출하고, 사용자가 닫아야만
/// (X 버튼, `AppState.dismissInviteCard()`) 사라지며 그 상태를 영구 기억한다. "공유하기"로 초대 화면에
/// 가는 것만으로는 닫지 않는다 — 홈으로 돌아왔을 때도 계속 보이는 게 상시 노출 취지에 맞다.
struct InviteCard: View {
    @Environment(AppState.self) private var app
    var body: some View {
        HStack(spacing: Spacing.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Copy.inviteHeadline).font(AppFont.headline)
            }
            Spacer()
            Button(Copy.shareAction) {
                app.tab = .gallery
                app.galleryPath = [.settings, .invite]
            }
            .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
            Button { withAnimation(Motion.exitCurve()) { app.dismissInviteCard() } } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink2)
                    .frame(width: 24, height: 24).background(Color.fill, in: Circle())
            }
            .buttonStyle(.plain).accessibilityLabel(Copy.close)
        }
        .padding(Spacing.s3 + 2)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s2)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

/// 가입 직후 1회 — "친구 초대로 오셨나요?" 코드 입력 시트(2026-11-15). 보상은 초대한 사람에게 5장.
/// 초대 페이지(public/invite.html)가 클립보드에 "rimikimi-invite:CODE" 를 넣어 두므로, 시스템 붙여넣기 버튼
/// (PasteButton — 권한 팝업 없음) 한 번으로 코드가 들어온다.
struct InviteCodeSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var claiming = false

    /// "rimikimi-invite:A3F9K2", 초대 링크(…/i/A3F9K2), 코드만 — 어느 쪽이든 6자 코드를 뽑는다.
    static func extract(_ raw: String) -> String? {
        let s = raw.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let start = s.range(of: "RIMIKIMI-INVITE:")?.upperBound ?? s.range(of: "/I/")?.upperBound ?? s.startIndex
        guard let r = s.range(of: "[2-9A-HJKMNP-Z]{6}", options: .regularExpression, range: start..<s.endIndex)
        else { return nil }
        return String(s[r])
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text(Copy.inviteAskTitle).font(AppFont.title2)
                Text(Copy.inviteAskDesc).font(AppFont.footnote).foregroundStyle(Color.ink2)
            }
            HStack(spacing: Spacing.s2) {
                TextField(Copy.inviteCodePlaceholder, text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(size: 20, weight: .bold, design: .rounded)).tracking(2)
                    .padding(.horizontal, Spacing.s3)
                    .frame(height: ControlHeight.button)
                    .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                PasteButton(payloadType: String.self) { strings in
                    if let c = strings.lazy.compactMap(Self.extract).first { code = c }
                }
                .labelStyle(.titleAndIcon)
                .buttonBorderShape(.capsule)
            }
            Button(claiming ? "…" : Copy.inviteApply) { claim() }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(claiming || code.trimmingCharacters(in: .whitespaces).count < 6)
            Button(Copy.inviteNoCode) { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
        }
        .padding(.horizontal, Spacing.page)
        .padding(.top, Spacing.s5)
        .padding(.bottom, Spacing.s4)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.bg)
    }

    private func claim() {
        let c = Self.extract(code) ?? code.trimmingCharacters(in: .whitespaces).uppercased()
        guard !claiming else { return }
        claiming = true
        Task {
            defer { claiming = false }
            guard let token = await app.auth.validAccessToken() else { app.handleNoToken(); return }
            do {
                let r = try await RimikimiAPI.shared.referralClaim(code: c, token: token)
                if r.ok {
                    HapticPlayer.success()
                    app.showToast(Copy.inviteOk)
                    await app.refreshQuota() // 초대받은 쪽 3장이 바로 칩에 보이게
                    dismiss()
                } else {
                    app.showToast(InviteView.failMessage(r.reason))
                    if r.reason == "already_referred" || r.reason == "self_referral" { dismiss() }
                }
            } catch {
                app.showToast(error.localizedDescription)
            }
        }
    }
}
