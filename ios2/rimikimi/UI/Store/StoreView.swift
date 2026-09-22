import SwiftUI

/// 프로필 > 스토어 — 크레딧 팩 4 + rimikimi+ 구독 3. 가격은 스토어가 준 값, 없으면 KRW 정가.
struct StoreView: View {
    @Environment(AppState.self) private var app
    @State private var busyID: String?
    @State private var restoring = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack {
                    Text("현재 보유").font(AppFont.callout).foregroundStyle(Color.ink2)
                    Spacer()
                    Text(app.quota?.chipLabel ?? "–").font(AppFont.headline)
                }
                .padding(Spacing.s4)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                .padding(.horizontal, Spacing.page)

                Text("하루 무료 1장을 모두 사용했어요. 크레딧 1장으로 이미지 한 장을 만들 수 있어요.")
                    .font(AppFont.footnote).foregroundStyle(Color.ink2).padding(.horizontal, Spacing.page)

                SectionHeader(title: "크레딧 팩")
                VStack(spacing: Spacing.s2) {
                    ForEach(app.store.packs) { p in PackRow(pack: p, busy: busyID == p.id) { buy(p) } }
                }
                .padding(.horizontal, Spacing.page)

                SectionHeader(title: "rimikimi+ 구독")
                Text("광고·워터마크 제거 + 크레딧 자동 충전").font(AppFont.footnote).foregroundStyle(Color.ink2)
                    .padding(.horizontal, Spacing.page).padding(.top, -Spacing.s2)
                VStack(spacing: Spacing.s2) {
                    ForEach(app.store.subs) { p in PackRow(pack: p, busy: busyID == p.id) { buy(p) } }
                }
                .padding(.horizontal, Spacing.page)

                if let err = app.store.lastError {
                    Text(err).font(AppFont.footnote).foregroundStyle(Color.accent).padding(.horizontal, Spacing.page)
                }
                Button(restoring ? "복원 중…" : "구매 복원") {
                    restoring = true
                    Task { _ = await app.store.restore(); await app.refreshQuota(); restoring = false; app.showToast("구매 내역을 확인했어요.") }
                }
                .buttonStyle(TextButtonStyle(color: .ink2))
                .frame(maxWidth: .infinity).padding(.top, Spacing.s3)
                Text("구매는 App Store 계정으로 안전하게 결제돼요. 구독은 기간 종료 24시간 전까지 해지하지 않으면 자동 갱신돼요.")
                    .font(AppFont.caption).foregroundStyle(Color.ink3).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).padding(.horizontal, Spacing.page)
                LegalLinksRow()
                    .frame(maxWidth: .infinity).padding(.horizontal, Spacing.page)
            }
            .padding(.top, Spacing.s3)
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle("스토어")
        .toolbar(.hidden, for: .tabBar)
        .task { await app.store.loadProducts() }
    }

    private func buy(_ pack: StoreManager.Pack) {
        guard busyID == nil else { return }
        busyID = pack.id
        Task {
            defer { busyID = nil }
            guard let token = await app.auth.validAccessToken() else { app.handleNoToken(); return }
            do {
                if let n = try await app.store.purchase(pack, token: token) {
                    app.showToast("🎉 +\(n) 크레딧 충전 완료!")
                    await app.refreshAfterStorePurchase() // 스토어 탭 — 예약 이어가지 않음
                }
            } catch {
                app.showToast("결제 처리 실패: \(error.localizedDescription)")
            }
        }
    }
}

/// 팩 한 줄 — 이름 · 장수 · 장당가 · 가격 버튼.
struct PackRow: View {
    var pack: StoreManager.Pack
    var busy: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(pack.isSubscription ? "rimikimi+ \(pack.label)" : "\(pack.credits)장").font(AppFont.headline)
                        if let b = pack.badge {
                            Text(b).font(AppFont.badge).foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accent, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                        }
                    }
                    Text(pack.isSubscription ? "매\(pack.period ?? "") \(pack.credits) 크레딧" : "장당 \((pack.krw / pack.credits).formatted())원")
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                }
                Spacer()
                Text(busy ? "처리 중…" : pack.displayPrice)
                    .font(AppFont.calloutEmphasis)
                    .foregroundStyle(Color.onAccent)
                    .padding(.horizontal, Spacing.s3)
                    .frame(height: ControlHeight.small)
                    .background(Color.accent, in: RoundedRectangle(cornerRadius: Radius.button - 2, style: .continuous))
            }
            .padding(Spacing.s4)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.985))
        .disabled(busy)
    }
}

/// 크레딧 부족 시트 — 팩 3개 · 구독 1개 · "친구 초대로 무료 3장". 구매 즉시 하던 생성이 이어진다(SPEC §3).
struct CreditsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var busyID: String?

    private var packs: [StoreManager.Pack] { Array(app.store.packs.prefix(3)) }
    private var sub: StoreManager.Pack? { app.store.subs.first { $0.id == "rimikimi.sub.plus.monthly" } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack {
                    Text("크레딧이 부족해요").font(AppFont.title2).tracking(Tracking.title2)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                            .frame(width: 30, height: 30).background(Color.fill, in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel("닫기")
                }
                Text(app.willContinueAfterPurchase ? "충전하면 하던 작업이 바로 이어져요." : "크레딧 1장으로 이미지 한 장을 만들 수 있어요.")
                    .font(AppFont.callout).foregroundStyle(Color.ink2)

                ForEach(packs) { p in PackRow(pack: p, busy: busyID == p.id) { buy(p) } }
                if let sub { PackRow(pack: sub, busy: busyID == sub.id) { buy(sub) } }

                Button {
                    dismiss()
                    app.tab = .profile
                    app.profilePath = [.invite]
                } label: { Label("친구 초대로 무료 3장", systemImage: "gift") }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, Spacing.s1)

                if let err = app.store.lastError {
                    Text(err).font(AppFont.footnote).foregroundStyle(Color.accent)
                }
                // 3.1.2 — 구독도 파는 화면이라 자동갱신 고지가 필요하다(컴플라이언스 리뷰로 발견:
                // 이 시트에만 없고 StoreView 에는 있던 문구). 두 화면 문구를 동일하게 맞췄다.
                Text("구매는 App Store 계정으로 안전하게 결제돼요. 구독은 기간 종료 24시간 전까지 해지하지 않으면 자동 갱신돼요.")
                    .font(AppFont.caption).foregroundStyle(Color.ink3).frame(maxWidth: .infinity)
                LegalLinksRow()
                    .frame(maxWidth: .infinity)
            }
            .padding(Spacing.page)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .task { await app.store.loadProducts() }
    }

    private func buy(_ pack: StoreManager.Pack) {
        guard busyID == nil else { return }
        busyID = pack.id
        Task {
            defer { busyID = nil }
            guard let token = await app.auth.validAccessToken() else {
                if app.auth.session == nil { dismiss(); app.loginSheet = true } else { app.handleNoToken() }
                return
            }
            do {
                if let n = try await app.store.purchase(pack, token: token) {
                    app.showToast("🎉 +\(n) 크레딧 충전 완료!")
                    await app.continueAfterPurchase()
                }
            } catch {
                app.showToast("결제 처리 실패: \(error.localizedDescription)")
            }
        }
    }
}

/// 이용약관·개인정보처리방침 링크 — 두 구매 화면(StoreView·CreditsSheet) 공통.
/// Apple 3.1.2 는 구독을 파는 화면에 약관·개인정보 링크가 있어야 한다고 요구한다
/// (컴플라이언스 리뷰로 발견: 이전엔 프로필 화면에만 있었다).
private struct LegalLinksRow: View {
    // ⚠️ 재검증으로 발견(2026-09-19): `CreditsSheet` 에서 쓰일 때 `app.webTool`(fullScreenCover)은
    // 이미 떠 있는 시트 위로는 못 뜬다(같은 프레젠터, UIKit 은 모달 1개 제한) — 조용히 무시된다.
    // 시스템 브라우저(`openURL`)는 시트든 푸시 화면이든 항상 동작해 양쪽 다 안전하다.
    @Environment(\.openURL) private var openURL
    var body: some View {
        HStack(spacing: Spacing.s3) {
            Button("이용약관") { openURL(Config.termsURL) }
            Text("·").foregroundStyle(Color.ink3)
            Button("개인정보처리방침") { openURL(Config.privacyURL) }
        }
        .font(AppFont.caption)
        .buttonStyle(.plain)
        .foregroundStyle(Color.ink3)
        .multilineTextAlignment(.center)
    }
}
