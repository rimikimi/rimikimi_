import SwiftUI

/// 프로필 > 스토어 — 크레딧 팩(첫 구매면 할인 팩). 가격은 스토어가 준 값, 없으면 KRW 정가.
/// rimikimi+ 구독은 판매 중단(오너 2026-10-11 "AI 이미지 생성은 크레딧으로만") — 구매 복원은 남긴다.
struct StoreView: View {
    @Environment(AppState.self) private var app
    @State private var busyID: String?
    @State private var restoring = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack {
                    Text(Copy.storeBalance).font(AppFont.callout).foregroundStyle(Color.ink2)
                    Spacer()
                    Text(app.quota?.chipLabel ?? "–").font(AppFont.headline)
                }
                .padding(Spacing.s4)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                .padding(.horizontal, Spacing.page)

                SectionHeader(title: Copy.storePacks)
                VStack(spacing: Spacing.s2) {
                    ForEach(app.store.packs(firstPurchase: app.quota?.firstPurchase == true)) { p in PackRow(pack: p, busy: busyID == p.id) { buy(p) } }
                }
                .padding(.horizontal, Spacing.page)

                if let err = app.store.lastError {
                    Text(err).font(AppFont.footnote).foregroundStyle(Color.accent).padding(.horizontal, Spacing.page)
                }
                Button(restoring ? Copy.restoring : Copy.restore) {
                    restoring = true
                    Task { _ = await app.store.restore(); await app.refreshQuota(); restoring = false; app.showToast(Copy.restoreDone) }
                }
                .buttonStyle(TextButtonStyle(color: .ink2))
                .frame(maxWidth: .infinity).padding(.top, Spacing.s3)
                Text(Copy.storeLegalCredits)
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
        .inlineTitle(Copy.store)
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
                    // 0 = 테스트(샌드박스) 결제 — 서버가 실서비스 크레딧을 주지 않는다(efa4741).
                    app.showToast(n > 0 ? Copy.purchaseDone(n) : Copy.purchaseTestNoCredit)
                    await app.refreshAfterStorePurchase() // 스토어 탭 — 예약 이어가지 않음
                }
            } catch {
                // 202 = 결제는 됐고 적립 확인만 늦는 중 — "실패" 라고 말하면 안 된다.
                if (error as? APIError)?.status == 202 { app.showToast(error.localizedDescription) }
                else { app.showToast(Copy.purchaseFailed(error.localizedDescription)) }
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
                        Text(pack.isSubscription ? "rimikimi+ \(pack.label)" : Copy.photos(pack.credits)).font(AppFont.headline)
                        if let b = pack.badge {
                            Text(b).font(AppFont.badge).foregroundStyle(Color.accent)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentTint, in: Capsule())
                        }
                    }
                    Text(pack.isSubscription ? Copy.subLine(period: pack.period, credits: pack.credits) : Copy.perImage(krw: pack.krw / pack.credits))
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                    if let intro = pack.introPrice {
                        Text(Copy.introLine(period: pack.period, intro: intro, regular: pack.displayPrice))
                            .font(AppFont.footnote).foregroundStyle(Color.accent)
                    }
                }
                Spacer()
                if let regular = pack.regularPrice, !busy {
                    Text(regular).font(AppFont.footnote).strikethrough().foregroundStyle(Color.ink3)
                }
                Text(busy ? Copy.processing : (pack.introPrice ?? pack.displayPrice))
                    // 애플 앱스토어 "받기" 버튼처럼 — 회색 알약에 강조색 글자(빨강 면 금지, 2026-10-11).
                    .font(AppFont.calloutEmphasis)
                    .foregroundStyle(Color.accent)
                    .padding(.horizontal, Spacing.s4)
                    .frame(height: ControlHeight.small - 4)
                    .background(Color.fill, in: Capsule())
            }
            .padding(Spacing.s4)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.985))
        .disabled(busy)
    }
}

/// 크레딧 부족 시트 — 팩 3개 · "친구 초대로 무료 3장". 구매 즉시 하던 생성이 이어진다(SPEC §3).
struct CreditsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var busyID: String?

    private var packs: [StoreManager.Pack] { Array(app.store.packs(firstPurchase: app.quota?.firstPurchase == true).prefix(3)) }

    var body: some View {
        NavigationStack {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if app.creditsSheetForAds {
                    Label(Copy.adFreeDesc, systemImage: "sparkles").font(AppFont.callout).foregroundStyle(Color.ink2)
                }
                ForEach(packs) { p in PackRow(pack: p, busy: busyID == p.id) { buy(p) } }

                Button {
                    dismiss()
                    app.tab = .gallery
                    app.galleryPath = [.settings, .invite]
                } label: { Label(Copy.inviteForFree, systemImage: "gift") }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, Spacing.s1)

                if let err = app.store.lastError {
                    Text(err).font(AppFont.footnote).foregroundStyle(Color.accent)
                }
                Text(Copy.storeLegalCredits)
                    .font(AppFont.caption).foregroundStyle(Color.ink3).frame(maxWidth: .infinity)
                LegalLinksRow()
                    .frame(maxWidth: .infinity)
            }
            .padding(Spacing.page)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .navigationTitle(app.creditsSheetForAds ? Copy.adFreeTitle : Copy.notEnoughCredits).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(role: .close) { dismiss() }.tint(Color.ink) } }
        .task { await app.store.loadProducts() }
        } // NavigationStack
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
                    // 0 = 테스트(샌드박스) 결제 — 서버가 실서비스 크레딧을 주지 않는다(efa4741).
                    app.showToast(n > 0 ? Copy.purchaseDone(n) : Copy.purchaseTestNoCredit)
                    await app.continueAfterPurchase()
                }
            } catch {
                // 202 = 결제는 됐고 적립 확인만 늦는 중 — "실패" 라고 말하면 안 된다.
                if (error as? APIError)?.status == 202 { app.showToast(error.localizedDescription) }
                else { app.showToast(Copy.purchaseFailed(error.localizedDescription)) }
            }
        }
    }
}

/// 이용약관·개인정보처리방침 링크 — 두 구매 화면(StoreView·CreditsSheet) 공통.
/// Apple 3.1.2 는 구독을 파는 화면에 약관·개인정보 링크가 있어야 한다고 요구한다
/// (컴플라이언스 리뷰로 발견: 이전엔 프로필 화면에만 있었다).
struct LegalLinksRow: View {
    // ⚠️ 재검증으로 발견(2026-09-19): `CreditsSheet` 에서 쓰일 때 `app.webTool`(fullScreenCover)은
    // 이미 떠 있는 시트 위로는 못 뜬다(같은 프레젠터, UIKit 은 모달 1개 제한) — 조용히 무시된다.
    // 시스템 브라우저(`openURL`)는 시트든 푸시 화면이든 항상 동작해 양쪽 다 안전하다.
    @Environment(\.openURL) private var openURL
    var body: some View {
        HStack(spacing: Spacing.s3) {
            Button(Copy.terms) { openURL(Config.termsURL) }
            Text("·").foregroundStyle(Color.ink3)
            Button(Copy.privacy) { openURL(Config.privacyURL) }
        }
        .font(AppFont.caption)
        .buttonStyle(.plain)
        .foregroundStyle(Color.ink3)
        .multilineTextAlignment(.center)
    }
}


/// 만들기 직전 안내(무료 사용자) — "광고 없애기"(크레딧 충전) / "광고 보고 계속".
struct AdFreePromptSheet: View {
    var guest = false
    var onBuy: () -> Void
    var onContinue: () -> Void
    var body: some View {
        VStack(spacing: Spacing.s3) {
            Image(systemName: "sparkles.rectangle.stack").font(.system(size: 34, weight: .regular)).foregroundStyle(Color.accent)
                .padding(.top, Spacing.s4)
            Text(guest ? Copy.guestRewardTitle : Copy.adFreeTitle).font(AppFont.title2).tracking(Tracking.title2)
            Text(guest ? Copy.guestRewardDesc : Copy.adFreeDesc).font(AppFont.callout).foregroundStyle(Color.ink2).multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.s4)
            Spacer(minLength: 0)
            if guest {
                Button(Copy.adFreeContinue, action: onContinue).buttonStyle(PrimaryButtonStyle())
            } else {
                Button(Copy.adFreeBuy, action: onBuy).buttonStyle(PrimaryButtonStyle())
                Button(Copy.adFreeContinue, action: onContinue).buttonStyle(TextButtonStyle(color: .ink2))
            }
        }
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s4)
        .frame(maxWidth: .infinity)
        .background(Color.bg)
    }
}
