import SwiftUI

/// 게스트 첫 1장 — 만드는 중 → 미리보기 2장 중 1장 고르기 → "받기"(여기서 처음 로그인) → 앨범 저장.
/// 시제품 C안 4·5·6 화면과 같다(오너 결정 2026-10-09).
struct GuestFlowView: View {
    @Environment(AppState.self) private var app
    /// 띄울 때의 값 — 화면은 항상 `app.guestFlow`(최신)를 본다. 이 값만 보면 결과가 와도 "만드는 중"에 멈춘다.
    var initial: AppState.GuestFlow
    @State private var picked: Int?
    private var flow: AppState.GuestFlow { app.guestFlow ?? initial }

    var body: some View {
        @Bindable var app = app
        VStack(spacing: Spacing.s4) {
            HStack {
                Button { app.guestFlow = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                        .frame(width: 40, height: 40).background(Color.card, in: Circle())
                }
                Spacer()
            }
            .padding(.horizontal, Spacing.page)

            if let err = flow.error {
                Spacer()
                Text(err).font(AppFont.body).foregroundStyle(Color.ink2).multilineTextAlignment(.center).padding(.horizontal, Spacing.page)
                Spacer()
            } else if flow.images.isEmpty {
                Spacer()
                HStack(spacing: 6) {
                    ForEach([Color.heartRed, .heartYellow, .heartBlue, .heartPurple], id: \.self) { c in
                        Image(systemName: "heart.fill").font(.system(size: 26)).foregroundStyle(c)
                    }
                }
                .symbolEffect(.pulse)
                Text(flow.title).font(AppFont.headline)
                Text(Copy.guestMaking).font(AppFont.callout).foregroundStyle(Color.ink2)
                ProgressView().padding(.top, Spacing.s2)
                Spacer()
            } else {
                Text(Copy.guestPick).font(AppFont.sectionTitle).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, Spacing.page)
                HStack(spacing: Spacing.s3) {
                    ForEach(Array(flow.images.enumerated()), id: \.offset) { i, img in
                        Button { picked = i; HapticPlayer.selection() } label: {
                            Image(uiImage: img).resizable().scaledToFill()
                                .frame(maxWidth: .infinity).aspectRatio(3 / 4, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                                    .strokeBorder(picked == i ? Color.accent : .clear, lineWidth: 3))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, Spacing.page)
                Label(Copy.guestIdentity, systemImage: "checkmark")
                    .font(AppFont.footnote.weight(.semibold)).foregroundStyle(Color(red: 0.18, green: 0.49, blue: 0.31))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(red: 0.91, green: 0.96, blue: 0.93), in: Capsule())
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, Spacing.page)
                Spacer()
                VStack(spacing: Spacing.s2) {
                    Button { if let i = picked { app.guestReceive(flow.images[i]) } } label: { Text(Copy.guestReceive) }
                        .buttonStyle(PrimaryButtonStyle(isDisabled: picked == nil)).disabled(picked == nil)
                    Button(Copy.guestAgain) { app.guestFlow = nil }.buttonStyle(TextButtonStyle(color: .ink2))
                }
                .padding(.horizontal, Spacing.page).padding(.bottom, Spacing.s3)
            }
        }
        .padding(.top, Spacing.s3)
        .background(Color.bg.ignoresSafeArea())
        // 이 화면이 떠 있으면 루트에선 시트를 못 띄운다 — 로그인 시트는 여기서.
        .sheet(isPresented: $app.loginSheet) {
            LoginSheet(message: app.loginMessage).presentationDetents([.medium, .large]).presentationCornerRadius(Radius.sheet)
        }
    }
}
