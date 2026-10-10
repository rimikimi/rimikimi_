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
        // ⚠️ 필터 이용권(월·연) 구독은 광고 제거가 아니다 — rimikimi+ 상품만 센다(2026-10-10 필터 이용권 추가).
        return info.activeSubscriptions.contains { Self.plusIDs.contains($0) }
    }
    static var plusIDs: Set<String> { Set(subs.map(\.id)) }

    func restore() async -> Bool {
        guard available, configured else { return false }
        do { let info = try await Purchases.shared.restorePurchases(); applyFilterAccess(info); return true }
        catch { lastError = error.localizedDescription; return false }
    }

    // MARK: 필터 이용권 (계약서 filterpass_spec.md)
    //
    // unlocked = entitlement("filters") 활성 || trialStart == nil(아직 시작 전 = 3일 자격) || now < trialStart + 3일.
    // 상품은 크레딧과 무관 — 서버 지급(iapGrant)을 부르지 않는다. 로그인도 필요 없다(카메라 탭은 로그인 없이 쓴다).

    struct FilterPlan: Identifiable, Hashable {
        enum Kind: String { case lifetime, annual, monthly }
        let kind: Kind
        var id: String { "rimikimi.filter.\(kind.rawValue)" }
        var priceString: String?
        /// 스토어 가격을 못 받았을 때만 쓰는 KRW 정가(오너 결정 2026-10-10).
        var krw: Int { switch kind { case .lifetime: 9900; case .annual: 4900; case .monthly: 1900 } }
        var displayPrice: String { priceString ?? Copy.krw(krw) }
        var isSubscription: Bool { kind != .lifetime }
        /// 오퍼링(또는 상품)이 실제로 로드됐는지 — 아니면 버튼을 막는다.
        var purchasable: Bool { priceString != nil }
    }

    /// `free` = 원격 스위치가 꺼져 있음(지금 기본) — 필터 전부 무료, 잠금·결제·3일 계산 없음.
    enum FilterAccess: Equatable { case free, locked, trial, pass, plus }

    /// 원격 스위치 `labels.json` → `"filterPass": {"enabled": "true"}`(오너 2026-10-10: 꺼 둔 채로 출시, 앱 업데이트 없이 켠다).
    /// dev 라우트가 상태를 강제하면 켜진 것으로 본다.
    var filterPassEnabled: Bool { devFilterState != nil || devForceEnabled || LabelStore.flag("filterPass") }
    /// 캡처용(`/dev/filterpass?state=on`) — 상태는 강제하지 않고 스위치만 켠다(실제 규칙 그대로).
    var devForceEnabled = false

    static let filterTrialDays: Double = 3
    static let filterEntitlement = "filters"
    static let filterOffering = "filters"

    private(set) var filterPlans: [FilterPlan] = [.init(kind: .annual), .init(kind: .monthly), .init(kind: .lifetime)]
    private var filterPackages: [FilterPlan.Kind: Package] = [:]
    private var filterProducts: [FilterPlan.Kind: StoreProduct] = [:]
    private(set) var filterPlansLoading = false
    private(set) var filterPlansError: String?
    private(set) var filterPurchasing: String?
    /// RevenueCat 기준 — entitlement `filters` 또는 rimikimi+ 구독(대시보드 매핑이 아직이어도 plus 는 열어 둔다).
    private(set) var filterEntitled = false
    private(set) var filterViaPlus = false
    /// 처음 3일 시작 시각(키체인).
    private(set) var trialStart: Date? = FilterPassKeychain.readTrialStart()
    /// 캡처용 강제 상태(`/dev/filterpass`). 키체인은 건드리지 않는다. 릴리스에선 항상 nil.
    var devFilterState: FilterAccess?
    var devTrialEndsAt: Date?

    var trialEndsAt: Date? {
        if let d = devFilterState { return (d == .trial || d == .locked) ? devTrialEndsAt : nil }
        guard filterPassEnabled else { return nil }
        // 아직 시작 전이면 "지금 시작하면" 끝나는 때(저장하지 않음) — 시작 전 = 3일 자격이 있다는 뜻이지 잠금이 아니다.
        return (trialStart ?? Date()).addingTimeInterval(Self.filterTrialDays * 86_400)
    }
    var filterAccess: FilterAccess {
        if let d = devFilterState { return d }
        guard filterPassEnabled else { return .free }
        if filterEntitled { return filterViaPlus ? .plus : .pass }
        if let end = trialEndsAt, Date() < end { return .trial }
        return .locked
    }
    var filtersUnlocked: Bool { filterAccess != .locked }
    /// 처음 3일 남은 날(올림). 3일 중이 아니면 nil.
    var trialDaysLeft: Int? {
        guard filterAccess == .trial, let end = trialEndsAt else { return nil }
        return max(1, Int((end.timeIntervalSinceNow / 86_400).rounded(.up)))
    }
    /// 편집기 `__rimikimiInit` 에 싣는 값 — trialEndsAt 은 이용권/plus 면 null, 3일을 시작한 적 없으면 null.
    var filterInitPayload: [String: Any] {
        let unlocked = filtersUnlocked
        var end: Any = NSNull()
        if filterAccess == .trial || filterAccess == .locked, let e = trialEndsAt {
            end = ISO8601DateFormatter().string(from: e)
        }
        return ["filtersUnlocked": unlocked, "trialEndsAt": end]
    }

    /// 원본이 아닌 필터를 처음 적용했을 때(카메라 줄 선택 / 편집기 `filterUsed`). 이미 시작했으면 그대로.
    func startFilterTrialIfNeeded() {
        // 스위치가 꺼져 있는 동안은 3일을 세지 않는다 — 켜진 뒤 처음 쓴 순간부터.
        guard filterPassEnabled, devFilterState == nil || devForceEnabled, trialStart == nil else { return }
        let now = Date()
        FilterPassKeychain.writeTrialStart(now)
        trialStart = now
        AppLog.api.info("filterpass.trial.start")
    }

    #if DEBUG
    func debugResetTrial() { FilterPassKeychain.debugClear(); trialStart = nil }
    #endif

    /// 캐시된 CustomerInfo 로 이용권 상태 갱신 — 실행·로그인·앱 활성화 때.
    func refreshFilterAccess() async {
        guard available, configured else { return }
        guard let info = try? await Purchases.shared.customerInfo() else { return }
        applyFilterAccess(info)
    }

    private func applyFilterAccess(_ info: CustomerInfo) {
        let ent = info.entitlements[Self.filterEntitlement]?.isActive == true
        let plus = info.activeSubscriptions.contains { Self.plusIDs.contains($0) }
        let ownsFilter = info.activeSubscriptions.contains { $0.hasPrefix("rimikimi.filter.") }
            || info.nonSubscriptions.contains { $0.productIdentifier == "rimikimi.filter.lifetime" }
        filterEntitled = ent || plus || ownsFilter
        filterViaPlus = plus && !ownsFilter
    }

    /// 오퍼링 `filters`(lifetime/annual/monthly). 없으면 상품 ID 로 직접 받는다. 둘 다 없으면 KRW 정가로 보여 주고 버튼은 막는다.
    func loadFilterPlans() async {
        guard available else { filterPlansError = Copy.payNotReady; return }
        if !configured { configure(userID: nil) }
        filterPlansLoading = true
        defer { filterPlansLoading = false }
        if let off = try? await Purchases.shared.offerings().offering(identifier: Self.filterOffering) {
            for pkg in off.availablePackages {
                let kind: FilterPlan.Kind?
                switch pkg.packageType {
                case .lifetime: kind = .lifetime
                case .annual: kind = .annual
                case .monthly: kind = .monthly
                default: kind = FilterPlan.Kind.allCases.first { pkg.storeProduct.productIdentifier == "rimikimi.filter.\($0.rawValue)" }
                }
                if let kind { filterPackages[kind] = pkg; filterProducts[kind] = pkg.storeProduct }
            }
        }
        if filterProducts.count < 3 {
            let ids = FilterPlan.Kind.allCases.map { "rimikimi.filter.\($0.rawValue)" }
            for p in await Purchases.shared.products(ids) {
                if let k = FilterPlan.Kind.allCases.first(where: { "rimikimi.filter.\($0.rawValue)" == p.productIdentifier }), filterProducts[k] == nil {
                    filterProducts[k] = p
                }
            }
        }
        filterPlans = filterPlans.map { var x = $0; x.priceString = filterProducts[$0.kind]?.localizedPriceString; return x }
        filterPlansError = filterProducts.isEmpty ? Copy.filterPassNotLoaded : nil
        AppLog.api.info("filterpass.plans offering=\(self.filterPackages.keys.map(\.rawValue).sorted(), privacy: .public) products=\(self.filterProducts.keys.map(\.rawValue).sorted(), privacy: .public)")
        await refreshFilterAccess()
    }

    /// 구매 — 열렸으면 true, 취소면 false, 실패면 throw.
    func purchaseFilter(_ plan: FilterPlan) async throws -> Bool {
        guard available else { throw APIError(message: Copy.payNotReady) }
        guard filterPurchasing == nil else { return false }
        if !configured { configure(userID: nil) }
        filterPurchasing = plan.id
        defer { filterPurchasing = nil }
        let result: PurchaseResultData
        if let pkg = filterPackages[plan.kind] { result = try await Purchases.shared.purchase(package: pkg) }
        else if let product = filterProducts[plan.kind] { result = try await Purchases.shared.purchase(product: product) }
        else { throw APIError(message: Copy.storeProductMissing) }
        if result.userCancelled { return false }
        applyFilterAccess(result.customerInfo)
        // 대시보드 entitlement 매핑이 늦어도 방금 산 상품이면 연다.
        if !filterEntitled { filterEntitled = true; filterViaPlus = false }
        HapticPlayer.success()
        return true
    }

    /// 구매 복원 — 복원 뒤 열렸으면 true.
    func restoreFilters() async -> Bool {
        guard available else { return false }
        if !configured { configure(userID: nil) }
        do { applyFilterAccess(try await Purchases.shared.restorePurchases()); return filterEntitled }
        catch { filterPlansError = error.localizedDescription; return false }
    }
}

extension StoreManager.FilterPlan.Kind: CaseIterable {}
