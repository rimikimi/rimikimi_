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
        var displayPrice: String { priceString ?? "\(krw.formatted())원" }
    }

    /// `src/PortraitStudio.jsx` CREDIT_PACKS / SUB_PLANS.
    static let packs: [Pack] = [
        .init(id: "rimikimi.pack.intro", credits: 6, krw: 3900, label: "인트로", badge: "첫 구매", isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.mini", credits: 12, krw: 7900, label: "미니", badge: nil, isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.standard", credits: 24, krw: 14900, label: "스탠다드", badge: "베스트 가치", isSubscription: false, period: nil),
        .init(id: "rimikimi.pack.pro", credits: 45, krw: 27000, label: "프로", badge: "장당 최저", isSubscription: false, period: nil),
    ]
    static let subs: [Pack] = [
        .init(id: "rimikimi.sub.plus.weekly", credits: 8, krw: 6900, label: "위클리", badge: nil, isSubscription: true, period: "주"),
        .init(id: "rimikimi.sub.plus.monthly", credits: 30, krw: 12900, label: "먼슬리", badge: nil, isSubscription: true, period: "월"),
        .init(id: "rimikimi.sub.plus.annual", credits: 240, krw: 109000, label: "애뉴얼", badge: "가장 저렴", isSubscription: true, period: "년"),
    ]
    static var allIDs: [String] { (packs + subs).map(\.id) }

    private(set) var packs: [Pack] = StoreManager.packs
    private(set) var subs: [Pack] = StoreManager.subs
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
        guard available else { lastError = "결제가 아직 준비되지 않았어요."; return }
        if !configured { configure(userID: nil) }
        isLoading = true
        defer { isLoading = false }
        let products = await Purchases.shared.products(Self.allIDs)
        for p in products { storeProducts[p.productIdentifier] = p }
        if products.isEmpty {
            lastError = "스토어가 상품 0개를 반환했어요. 잠시 후 다시 시도해 주세요."
        } else {
            lastError = nil
        }
        packs = Self.packs.map { var x = $0; x.priceString = storeProducts[$0.id]?.localizedPriceString; return x }
        subs = Self.subs.map { var x = $0; x.priceString = storeProducts[$0.id]?.localizedPriceString; return x }
    }

    // MARK: 구매

    /// 구매 → 서버 지급. 성공하면 지급된 크레딧 수(서버 값). 취소면 nil, 실패면 throw.
    func purchase(_ pack: Pack, token: String) async throws -> Int? {
        guard available else { throw APIError(message: "결제가 아직 준비되지 않았어요.") }
        guard purchasing == nil else { return nil }
        if storeProducts[pack.id] == nil { await loadProducts() }
        guard let product = storeProducts[pack.id] else { throw APIError(message: "스토어에서 상품을 찾지 못했어요.") }
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
