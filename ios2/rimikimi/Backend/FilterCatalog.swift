import Foundation

/// 서버 필터 카탈로그(`/filters.json`) — 필터 값·이름·묶음·추천·신규를 **앱 빌드 없이** 바꾼다
/// (오너 2026-10-27 "필터 업데이트할 때마다 빌드가 필요함? 컨셉은 빌드 없어도 되자나").
/// 원본은 웹 `src/filters.js`, 서버 파일은 `scripts/gen-filters-json.mjs` 가 만든다.
/// - 앱 엔진이 모르는 `special`(새 그리기 방식)을 가진 프리셋은 받지 않는다 — 앱에 같은 키가 있으면 앱 것을 쓴다(예: 빛번짐).
/// - 못 받으면 마지막으로 받은 것(저장본) → 그것도 없으면 코드에 적힌 기본값.
final class FilterCatalog {
    static let shared = FilterCatalog()
    private static let cacheKey = "filters.cache"
    private let lock = NSLock()

    struct Group { let key: String; let ko: String; let en: String; let keys: [String] }
    private var _groups: [Group] = []
    private var _featured: [String] = []
    private var _new: [String] = []
    private var _names: [String: (ko: String, en: String)] = [:]
    private var _presets: [String: LiveFilter.Preset] = [:]

    var groups: [Group] { lock.withLock { _groups } }
    var featured: [String] { lock.withLock { _featured } }
    var newKeys: [String] { lock.withLock { _new } }
    func name(_ key: String) -> (ko: String, en: String)? { lock.withLock { _names[key] } }
    /// 프레임 큐에서도 읽는다(잠금).
    func preset(_ key: String) -> LiveFilter.Preset? { lock.withLock { _presets[key] } }

    private init() {
        if let d = UserDefaults.standard.data(forKey: Self.cacheKey) { apply(d, save: false) }
    }

    /// 서버에서 받은 원본 JSON. 형식이 맞으면 반영하고 저장한다.
    func update(_ data: Data) { apply(data, save: true) }

    private func apply(_ data: Data, save: Bool) {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawPresets = root["presets"] as? [String: Any] else { return }
        var presets: [String: LiveFilter.Preset] = [:], names: [String: (ko: String, en: String)] = [:]
        for (k, v) in rawPresets {
            guard let d = v as? [String: Any] else { continue }
            if let ko = d["ko"] as? String, let en = d["en"] as? String { names[k] = (ko, en) }
            if let p = Self.decode(d) { presets[k] = p }
        }
        // 묶음은 앱이 그릴 수 있는 키만 남긴다(서버 값 또는 앱 기본값).
        let known = { (k: String) in presets[k] != nil || LiveFilter.builtinPresets[k] != nil }
        let groups: [Group] = (root["groups"] as? [[String: Any]] ?? []).compactMap { g in
            guard let key = g["key"] as? String, let keys = g["keys"] as? [String] else { return nil }
            return Group(key: key, ko: g["ko"] as? String ?? key, en: g["en"] as? String ?? key, keys: keys.filter(known))
        }.filter { !$0.keys.isEmpty }
        guard !groups.isEmpty else { return }
        let featured = (root["featured"] as? [String] ?? []).filter(known)
        let new = (root["new"] as? [String] ?? []).filter(known)
        lock.withLock { _groups = groups; _featured = featured; _new = new; _names = names; _presets = presets }
        if save { UserDefaults.standard.set(data, forKey: Self.cacheKey) }
    }

    /// filters.js 프리셋 한 개 → 앱 Preset. 모르는 special 이면 nil(앱 기본값을 쓴다).
    static func decode(_ d: [String: Any]) -> LiveFilter.Preset? {
        func num(_ k: String) -> Double { (d[k] as? NSNumber)?.doubleValue ?? 0 }
        func arr(_ k: String) -> [Double]? { (d[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } }
        var p = LiveFilter.Preset()
        if let s = d["special"] as? String {
            switch s {
            case "duotone": p.special = .duotone
            case "thermal": p.special = .thermal
            case "glitch": p.special = .glitch
            case "vhs": p.special = .vhs
            case "pixelate": p.special = .pixelate
            case "sketch": p.special = .sketch
            case "flashsoft": p.special = .flashSoft
            case "flashhard": p.special = .flashHard
            case "subjectglow": p.special = .subjectGlow
            default: return nil
            }
        }
        p.temp = num("temp"); p.tint = num("tint"); p.ex = num("ex"); p.con = num("con")
        p.fade = num("fade"); p.whitePull = num("whitePull"); p.sat = num("sat"); p.vib = num("vib")
        p.sh = arr("sh"); p.hi = arr("hi"); p.bw = arr("bw"); p.c1 = arr("c1"); p.c2 = arr("c2")
        p.hsl = (d["hsl"] as? [[String: Any]] ?? []).map { b in
            func n(_ k: String) -> Double { (b[k] as? NSNumber)?.doubleValue ?? 0 }
            return LiveFilter.Band(c: n("c"), w: n("w"), h: n("h"), s: n("s"), l: n("l"))
        }
        if let fx = d["fx"] as? [String: Any] {
            func n(_ k: String) -> Double { (fx[k] as? NSNumber)?.doubleValue ?? 0 }
            p.fx = LiveFilter.FX(grain: n("grain"), vignette: n("vignette"), leak: n("leak"), glow: n("glow"), blur: n("blur"), lowres: n("lowres"), spot: n("spot"))
        }
        return p
    }
}
