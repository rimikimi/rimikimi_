import SwiftUI

/// 필터 이용권 결제 시트 — 2026-10-11부터 **월간 하나**(첫 달 무료는 스토어 체험 오퍼, 자격은 스토어가 판정). 가격은 스토어 priceString,
/// 기간·자동갱신 안내, 이용약관·개인정보 링크, 구매 복원. 카드 모양은 StoreView `PackRow` 와 같은 재질
/// (유리는 탭바·상단 바에만 — Glass.swift). 원격 스위치가 꺼져 있으면 아무 데서도 열리지 않는다.
struct FilterPassSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// 구매·복원으로 열렸을 때 — 편집기는 여기서 `__rimikimiFilterAccess({unlocked:true})` 를 받는다.
    var onUnlocked: () -> Void = {}
    @State private var selected: StoreManager.FilterPlan.Kind = .lifetime
    @State private var restoring = false

    private var store: StoreManager { app.store }
    /// 스토어가 일부만 돌려주면(심사 전 상품 등) 받은 것만 보여 준다 — 달러·원 정가가 섞여 보이지 않게.
    /// 하나도 못 받았으면 KRW 정가로 3개 다 보여 주고 버튼은 막는다.
    private var plans: [StoreManager.FilterPlan] {
        let ok = store.filterPlans.filter(\.purchasable)
        return ok.isEmpty ? store.filterPlans : ok
    }
    private var plan: StoreManager.FilterPlan? { plans.first { $0.kind == selected } ?? plans.first }

    var body: some View {
        NavigationStack {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Text(Copy.filterPassSubtitle).font(AppFont.callout).foregroundStyle(Color.ink2)

                statusLine

                if store.filterAccess == .pass || store.filterAccess == .plus {
                    Button(Copy.close) { dismiss() }.buttonStyle(PrimaryButtonStyle()).padding(.top, Spacing.s2)
                } else {
                    VStack(spacing: Spacing.s2) {
                        ForEach(plans) { p in planRow(p) }
                    }
                    if let err = store.filterPlansError {
                        Text(err).font(AppFont.footnote).foregroundStyle(Color.accent)
                    }
                    Button {
                        buy()
                    } label: {
                        if store.filterPurchasing != nil { ProgressView().tint(.white) }
                        else if store.filterIntroEligible, plan?.kind == .monthly { Text(Copy.filterPassStartFree) }
                        else { Text(L.t("계속하기", "Continue") + (plan.map { " · \($0.displayPrice)" } ?? "")) }
                    }
                    .buttonStyle(PrimaryButtonStyle(isDisabled: !(plan?.purchasable ?? false)))
                    .disabled(!(plan?.purchasable ?? false) || store.filterPurchasing != nil)
                    .padding(.top, Spacing.s1)

                    Button(restoring ? Copy.restoring : Copy.restore) { restore() }
                        .buttonStyle(TextButtonStyle(color: .ink2))
                        .frame(maxWidth: .infinity)
                        .disabled(restoring)
                }

                Text(Copy.storeLegal)
                    .font(AppFont.caption).foregroundStyle(Color.ink3).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                LegalLinksRow().frame(maxWidth: .infinity)
            }
            .padding(Spacing.page)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .navigationTitle(Copy.filterPassTitle).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(role: .close) { dismiss() }.tint(Color.ink) } }
        .task { await store.loadFilterPlans() }
        } // NavigationStack
    }

    @ViewBuilder private var statusLine: some View {
        let (icon, text): (String, String) = {
            switch store.filterAccess {
            case .trial: return ("clock", store.trialDaysLeft.map(Copy.filterPassDaysLeft) ?? Copy.filterPassFreeLine)
            case .locked: return ("lock", store.trialEndsAt == nil ? Copy.filterPassFreeLine : Copy.filterPassEnded)
            case .pass: return ("checkmark.seal.fill", Copy.filterPassActive)
            case .plus: return ("checkmark.seal.fill", Copy.filterPassPlus)
            case .free: return ("sparkles", Copy.filterPassFreeLine)
            }
        }()
        Label(text, systemImage: icon)
            .font(AppFont.footnote).foregroundStyle(Color.ink)
            .padding(Spacing.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.accentTint, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }

    private func planRow(_ p: StoreManager.FilterPlan) -> some View {
        let on = p.kind == plan?.kind
        let (name, line): (String, String) = {
            switch p.kind {
            case .annual: return (Copy.filterPassAnnual, Copy.filterPassAnnualLine)
            case .monthly: return (Copy.filterPassMonthly, store.filterIntroEligible ? Copy.filterPassIntroLine(p.displayPrice) : Copy.filterPassMonthlyLine)
            case .lifetime: return (Copy.filterPassLifetime, StoreManager.lifetimePromoActive ? Copy.filterPassLaunchLine : Copy.filterPassLifetimeLine)
            }
        }()
        return Button { selected = p.kind; HapticPlayer.selection() } label: {
            HStack(spacing: Spacing.s3) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22)).foregroundStyle(on ? Color.accent : Color.ink3)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(name).font(AppFont.headline)
                        if p.kind == .lifetime && StoreManager.lifetimePromoActive {
                            Text(Copy.filterPassLaunchBadge).font(AppFont.badge).foregroundStyle(Color.accent)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentTint, in: Capsule())
                        }
                    }
                    Text(line).font(AppFont.footnote).foregroundStyle(Color.ink2)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    if p.kind == .lifetime && StoreManager.lifetimePromoActive {
                        Text(Copy.krw(9900)).font(AppFont.footnote).strikethrough().foregroundStyle(Color.ink3)
                    }
                    Text(store.filterIntroEligible && p.kind == .monthly ? L.t("첫 달 0원", "First month free") : p.displayPrice)
                        .font(AppFont.calloutEmphasis).foregroundStyle(Color.ink)
                }
            }
            .padding(Spacing.s4)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .stroke(on ? Color.accent : Color.separatorLine, lineWidth: on ? 2 : 1))
            .contentShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.985))
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private func buy() {
        guard let plan, store.filterPurchasing == nil else { return }
        Task {
            do {
                if try await store.purchaseFilter(plan) { unlocked() }
            } catch {
                app.showToast(Copy.purchaseFailed(error.localizedDescription))
            }
        }
    }

    private func restore() {
        restoring = true
        Task {
            let ok = await store.restoreFilters()
            restoring = false
            if ok && store.filtersUnlocked { unlocked() } else { app.showToast(Copy.filterPassNothingToRestore) }
        }
    }

    private func unlocked() {
        app.showToast(Copy.filterPassUnlocked)
        onUnlocked()
        dismiss()
    }
}
