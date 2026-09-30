import Foundation
import Observation
import RevenueCat

/// 인앱결제 — RevenueCat. 흐름은 1.x `src/iap.js` 그대로:
/// configure(익명) → 로그인 뒤 `logIn(user.id)` → `products(ids)` 로 스토어 가격 → `purchase` →
/// 거래 ID 를 `POST /api/iap/grant {productId, transactionId}` 로 보내면 서버가 RevenueCat 재검증 후 크레딧 지급.
/// 상품 ID 는 서버 `api/_lib/payments/packages.js` 와 1:1.
@MainActor
@Observable
final class StoreManager {
    struct Pack: Identifiable, Hashable {
        let id: String            // productId
        let credits: Int
        let krw: Int
        let label: String
        let badge: String?
        let isSubscription: Bool
        let period: String?       // week/month/year
        var priceString: String?  // 스토어가 준 실제 가격(없으면 KRW 폴백)
        /// 첫 구매 할인 팩이면 정가(취소선으로 같이 보여 준다).
        var regularPrice: String? = nil
        /// 구독 첫 결제 할인(애플 Introductory Offer)을 받을 수 있으면 그 가격(스토어 문자열).
        var introPrice: String? = nil
        var displayPrice: String { priceString ?? Copy.krw(krw) }
    }

    /// `src/PortraitStudio.jsx` CREDIT_PACKS / SUB_PLANS.
    /// 이름·배지가 번역 문구라 볼 때마다 만든다(앱 안 언어 전환 — `L`). 가격은 아래 인스턴스 `packs` 가 붙인다.
    /// 2026-09-30 오너 가격 개편: 인트로 팩(6장 ₩3,900) 판매 중단, 미니 12·스탠다드 24·프로 48.
    ///   + 1장 ₩1,900 · 인트로 3장 ₩3,900(새 상품 — 옛 intro 는 애플 설명이 "6장"으로 고정).
    static var packs: [Pack] { [
        .init(id: "rimikimi.pack.single", credits: 1, krw: 1900, label: Copy.packSingle, badge: nil, isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.trial", credits: 3, krw: 3900, label: Copy.packIntro, badge: nil, isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.mini", credits: 12, krw: 11900, label: Copy.packMini, badge: nil, isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.standard", credits: 24, krw: 22900, label: Copy.packStandard, badge: Copy.badgeBest, isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.pro", credits: 48, krw: 44900, label: Copy.packPro, badge: Copy.badgeCheapest, isSubscription: false, period: nil),
    ] }
    /// 첫 구매 30% 할인 — 소모품엔 애플 할인 기능이 없어 **별도 상품**이다(같은 장수). 한 번도 산 적 없는 계정
    /// (서버 quota `firstPurchase`)에게만, 그리고 스토어가 그 상품을 돌려줄 때만(심사 전이면 없음) 정가 팩 대신 보여 준다.
    static let firstPackID: [String: String] = [
        "rimikimi.pack.single": "rimikimi.pack.single.first",
        "rimikimi.pack.trial": "rimikimi.pack.trial.first",
        "rimikimi.pack.mini": "rimikimi.pack.mini.first",
        "rimikimi.pack.standard": "rimikimi.pack.standard.first",
        "rimikimi.pack.pro": "rimikimi.pack.pro.first",
    ]
    static let firstPackKRW: [String: Int] = ["rimikimi.pack.single": 1300, "rimikimi.pack.trial": 2700, "rimikimi.pack.mini": 8300, "rimikimi.pack.standard": 15900, "rimikimi.pack.pro": 31500]
    static var subs: [Pack] { [
        .init(id: "rimikimi.sub.plus.weekly", credits: 10, krw: 9900, label: Copy.subWeekly, badge: nil, isSubscription: true, period: "주"),
        .init(id: "rimikimi.sub.plus.monthly", credits: 35, krw: 29900, label: Copy.subMonthly, badge: nil, isSubscription: true, period: "월"),
        .init(id: "rimikimi.sub.plus.annual", credits: 400, krw: 299000, label: Copy.subAnnual, badge: Copy.badgeLowest, isSubscription: true, period: "년"),
    ] }
    static var allIDs: [String] { (packs + subs).map(\.id) + Array(firstPackID.values) }

    /// 화면용 목록 — 이름·배지는 지금 언어로, 가격은 스토어가 준 값(아직 없으면 KRW 폴백).
    /// `firstPurchase` 면 첫 구매 할인 팩으로 바꿔 보여 준다(정가는 취소선용으로 같이).
    func packs(firstPurchase: Bool) -> [Pack] {
        Self.packs.map { base in
            let regular = withStorePrice(base)
            guard firstPurchase, let fid = Self.firstPackID[base.id], let fp = storeProducts[fid] else { return regular }
            var x = Pack(id: fid, credits: base.credits, krw: Self.firstPackKRW[base.id] ?? base.krw, label: base.label,
                         badge: Copy.badgeFirstDiscount, isSubscription: false, period: nil)
            x.priceString = fp.localizedPriceString
            x.regularPrice = regular.displayPrice
            return x
        }
    }
    var subs: [Pack] {
        Self.subs.map { p in
            var x = withStorePrice(p)
            // 첫 결제 할인 — 애플이 이 계정을 대상자로 판정했을 때만 표시(결제창에도 애플이 같은 값을 띄운다).
            if introEligible.contains(p.id), let d = storeProducts[p.id]?.introductoryDiscount, d.price > 0 {
                x.introPrice = d.localizedPriceString
            }
            return x
        }
    }
    private func withStorePrice(_ p: Pack) -> Pack { var x = p; x.priceString = storeProducts[p.id]?.localizedPriceString; return x }
    /// 구독 첫 결제 할인 대상 상품 id(RevenueCat `checkTrialOrIntroDiscountEligibility`).
    private(set) var introEligible: Set<String> = []
    private(set) var isLoading = false
    private(set) var purchasing: String?
    private(set) var lastError: String?
    /// 마지막 지급 결과(크레딧 수) — 화면이 토스트로 보여준다.
    private(set) var lastGranted: Int?

    private var configured = false
    private var storeProducts: [String: StoreProduct] = [:]

    var available: Bool { !Config.revenueCatIOSKey.isEmpty }

    // MARK: 설정

    func configure(userID: String?) {
        guard available, !configured else { return }
        Purchases.logLevel = .warn
        Purchases.configure(with: Configuration.Builder(withAPIKey: Config.revenueCatIOSKey)
            .with(appUserID: userID)
            .build())
        configured = true
    }

    /// 로그인 뒤 — RevenueCat 식별자를 우리 Supabase user.id 로 맞춘다.
    func logIn(userID: String) async {
        guard available else { return }
        if !configured { configure(userID: userID) }
        do { _ = try await Purchases.shared.logIn(userID) }
        catch { AppLog.api.notice("iap.logIn.failed \(error.localizedDescription, privacy: .public)") }
    }

    func logOut() async {
        guard available, configured else { return }
        _ = try? await Purchases.shared.logOut()
    }

    // MARK: 상품

    func loadProducts() async {
        guard available else { lastError = Copy.payNotReady; return }
        if !configured { configure(userID: nil) }
        isLoading = true
        defer { isLoading = false }
        let products = await Purchases.shared.products(Self.allIDs)
        for p in products { storeProducts[p.productIdentifier] = p }
        let subIDs = Self.subs.map(\.id).filter { storeProducts[$0]?.introductoryDiscount != nil }
        if !subIDs.isEmpty {
            let el = await Purchases.shared.checkTrialOrIntroDiscountEligibility(productIdentifiers: subIDs)
            introEligible = Set(el.filter { $0.value.status == .eligible }.map(\.key))
        } else {
            introEligible = []
        }
        if products.isEmpty {
            lastError = Copy.storeNoProducts
        } else {
            lastError = nil
        }
    }

    // MARK: 구매

    /// 구매 → 서버 지급. 성공하면 지급된 크레딧 수(서버 값). 취소면 nil, 실패면 throw.
    func purchase(_ pack: Pack, token: String) async throws -> Int? {
        guard available else { throw APIError(message: Copy.payNotReady) }
        guard purchasing == nil else { return nil }
        if storeProducts[pack.id] == nil { await loadProducts() }
        guard let product = storeProducts[pack.id] else { throw APIError(message: Copy.storeProductMissing) }
        purchasing = pack.id
        defer { purchasing = nil }
        let result = try await Purchases.shared.purchase(product: product)
        if result.userCancelled { return nil }
        let txID = result.transaction?.transactionIdentifier
        let granted = try await RimikimiAPI.shared.iapGrant(productId: pack.id, transactionId: txID, token: token)
        lastGranted = granted
        HapticPlayer.success()
        return granted
    }

    /// rimikimi+ 구독 중인가. 구독은 "광고 제거" 로 팔리는데 광고 판정이 크레딧 잔액만 봐서,
    /// 크레딧을 다 쓴 구독자에게 광고가 나갔다(2026-09-18 스윕 #30). RevenueCat 의 캐시된
    /// CustomerInfo 를 본다 — 못 받으면 false(광고 판정은 기존 규칙 그대로).
    func hasActiveSubscription() async -> Bool {
        guard available, configured else { return false }
        guard let info = try? await Purchases.shared.customerInfo() else { return false }
        return !info.activeSubscriptions.isEmpty
    }

    func restore() async -> Bool {
        guard available, configured else { return false }
        do { _ = try await Purchases.shared.restorePurchases(); return true }
        catch { lastError = error.localizedDescription; return false }
    }
}
