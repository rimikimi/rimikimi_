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
                    Text("🎟 친구 초대하면 크레딧 3개").font(AppFont.headline)
                    Text("친구 1명 초대할 때마다 크레딧 3개! (현재 \(app.quota?.referralCount ?? 0)명 초대)")
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                }
                .padding(Spacing.s4).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))

                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text("내 초대 코드").font(AppFont.footnote).foregroundStyle(Color.ink2)
                    Button {
                        guard let c = myCode else { return }
                        UIPasteboard.general.string = c
                        HapticPlayer.success()
                        app.showToast("초대 코드를 복사했어요")
                    } label: {
                        HStack {
                            Text(myCode ?? "–").font(.system(size: 28, weight: .bold, design: .rounded)).tracking(2)
                            Spacer()
                            Text("탭해서 복사").font(AppFont.footnote).foregroundStyle(Color.ink2)
                        }
                        .padding(Spacing.s4)
                        .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                    }
                    .buttonStyle(PressScaleButtonStyle(scale: 0.985))
                    if let c = myCode {
                        ShareLink(item: Config.inviteURL(code: c),
                                  message: Text("내 얼굴로 인생 프로필 만들기 ✨ rimikimi 같이 해요! 이 링크로 시작하면 저도 크레딧을 받아요 🙌")) {
                            Label("공유하기", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                }
                .padding(Spacing.s4)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))

                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text("친구 초대 코드 입력").font(AppFont.footnote).foregroundStyle(Color.ink2)
                    HStack(spacing: Spacing.s2) {
                        TextField("6자 코드", text: $friendCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(AppFont.body)
                            .padding(.horizontal, Spacing.s3)
                            .frame(height: ControlHeight.button)
                            .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                        Button(claiming ? "…" : "등록") { claim() }
                            .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                            .disabled(claiming || friendCode.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    Text("설치 경로에서 링크가 끊겼을 때 친구의 코드를 직접 넣어요.").font(AppFont.caption).foregroundStyle(Color.ink3)
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
        .inlineTitle("친구 초대")
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
                    app.showToast("초대가 등록됐어요! 친구에게 크레딧 3개가 쌓였어요 🎉")
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
        case "invalid_code", "invalid_ref": return "코드를 다시 확인해 주세요"
        case "code_not_found", "ref_not_found": return "없는 코드예요"
        case "self_referral": return "내 코드는 등록할 수 없어요"
        case "already_referred": return "이미 초대 코드를 등록했어요"
        default: return "잠시 후 다시 시도해 주세요"
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
                Text("🎟 친구 초대하면 크레딧 3개").font(AppFont.headline)
                Text("친구 1명 초대할 때마다 크레딧 3개!").font(AppFont.footnote).foregroundStyle(Color.ink2)
            }
            Spacer()
            Button("공유하기") {
                app.tab = .profile
                app.profilePath = [.invite]
            }
            .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
            Button { withAnimation(Motion.exitCurve()) { app.dismissInviteCard() } } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink2)
                    .frame(width: 24, height: 24).background(Color.fill, in: Circle())
            }
            .buttonStyle(.plain).accessibilityLabel("닫기")
        }
        .padding(Spacing.s3 + 2)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s2)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
