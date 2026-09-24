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
                Text(Copy.inviteDescShort).font(AppFont.footnote).foregroundStyle(Color.ink2)
            }
            Spacer()
            Button(Copy.shareAction) {
                app.tab = .profile
                app.profilePath = [.invite]
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
