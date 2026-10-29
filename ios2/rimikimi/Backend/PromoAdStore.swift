import Foundation
import Observation

/// 생성 중 화면 케이스 광고(오너 2026-10-29) — 서버 `/promo-ads.json` 이 정한다.
/// 끄기·영상 교체·링크 교체는 전부 서버 파일로(빌드 없이). 못 받으면 마지막으로 받은 값, 그것도 없으면 안 보인다.
/// 광고 하나 = 30초 영상 + 구간(segments). 구간마다 시리즈가 달라서, 누르는 순간 재생 위치의 구간 링크로 간다.
@Observable
final class PromoAdStore {
    static let shared = PromoAdStore()
    private static let cacheKey = "promoAds.cache"

    struct Pair: Codable { let ios: String?; let android: String? }
    struct Text: Codable { let ko: String?; let en: String? }
    struct Segment: Codable { let until: Double; let series: String?; let link: Pair }
    struct Ad: Codable, Identifiable { let id: String; let video: Pair; let poster: Pair?; let segments: [Segment] }
    struct Settings: Codable {
        let enabled: Bool
        let locales: [String]?
        let headline: Text?
        let button: Text?
        let magicBoothFirst: String?
        let ads: [Ad]
    }

    private(set) var config: Settings?

    private init() {
        if let d = UserDefaults.standard.data(forKey: Self.cacheKey),
           let c = try? JSONDecoder().decode(Settings.self, from: d) { config = c }
    }

    func refresh() async {
        var req = URLRequest(url: Config.apiBase.appendingPathComponent("promo-ads.json"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let c = try? JSONDecoder().decode(Settings.self, from: data) else { return }
        await MainActor.run {
            config = c
            UserDefaults.standard.set(data, forKey: Self.cacheKey)
        }
    }

    /// 지금 이 사용자에게 보여도 되는지 — 스위치 + 언어(스마트스토어는 국내 배송).
    var isActive: Bool {
        guard let c = config, c.enabled, !c.ads.isEmpty else { return false }
        if let loc = c.locales, !loc.isEmpty { return loc.contains(L.ko ? "ko" : "en") }
        return true
    }

    func text(_ t: Text?, _ ko: String, _ en: String) -> String {
        let v = L.ko ? t?.ko : t?.en
        return (v?.isEmpty == false ? v! : L.t(ko, en))
    }

    static func url(_ path: String?) -> URL? {
        guard let p = path, !p.isEmpty else { return nil }
        if p.hasPrefix("http") { return URL(string: p) }
        return Config.apiBase.appendingPathComponent(p)
    }

    /// 재생 순서 — 무작위. 매직 부스 생성이면 `magicBoothFirst`(커스텀) 광고를 맨 앞으로.
    func playlist(magicBooth: Bool) -> [Ad] {
        guard let c = config else { return [] }
        var list = c.ads.shuffled()
        if magicBooth, let first = c.magicBoothFirst, let i = list.firstIndex(where: { $0.id == first }) {
            list.insert(list.remove(at: i), at: 0)
        }
        return list
    }

    static func link(of ad: Ad, at seconds: Double) -> URL? {
        let seg = ad.segments.first { seconds < $0.until } ?? ad.segments.last
        return url(seg?.link.ios)
    }
}
