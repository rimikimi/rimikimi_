import Foundation

/// 영어 문구 → 일본어·번체·인도네시아어·태국어·말레이어 사전(Resources/i18n_<lang>.json, 2026-11-16).
/// 키는 화면에 그려지는 영어 문장. 숫자·이름이 끼는 문장은 키에 `{0}` `{1}` 자리표시가 있고, 렌더된 영어를
/// 그 틀에 맞춰 값을 뽑아 번역문의 같은 자리에 넣는다. 사전에 없으면 영어 그대로(빈칸·깨짐 대신).
enum I18N {
    private struct Table {
        let exact: [String: String]
        let templates: [(NSRegularExpression, String, Int, Int)]
    }
    nonisolated(unsafe) private static var cache: [String: Table] = [:]
    private static let lock = NSLock()

    static func tr(_ en: String, _ lang: String) -> String {
        guard let t = table(lang) else { return en }
        if let v = t.exact[en] { return v }
        let ns = en as NSString
        for (re, out, n, _) in t.templates {
            guard let m = re.firstMatch(in: en, range: NSRange(location: 0, length: ns.length)) else { continue }
            var r = out
            for i in 0..<n { r = r.replacingOccurrences(of: "{\(i)}", with: ns.substring(with: m.range(at: i + 1))) }
            return r
        }
        return en
    }

    private static func table(_ lang: String) -> Table? {
        lock.lock(); defer { lock.unlock() }
        if let t = cache[lang] { return t }
        guard let url = Bundle.main.url(forResource: "i18n_\(lang)", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return nil }
        var exact: [String: String] = [:]
        var templates: [(NSRegularExpression, String, Int, Int)] = []
        let ph = try! NSRegularExpression(pattern: "\\{(\\d)\\}")
        for (k, v) in dict {
            let kn = k as NSString
            let ms = ph.matches(in: k, range: NSRange(location: 0, length: kn.length))
            if ms.isEmpty { exact[k] = v; continue }
            // 짧은 틀("{0} photos")은 빈칸에 숫자가 있어야만 맞춘다 — "Restore old photos" 같은 문장을 삼키지 않게.
            // 글자 수 14자 이상인 긴 문장 틀("Payment failed: {0}")만 빈칸에 아무 글이나 허용.
            let literal = ph.stringByReplacingMatches(in: k, range: NSRange(location: 0, length: kn.length), withTemplate: "")
            let cap = literal.count >= 14 ? "(.+?)" : "([^\\n]*?\\d[^\\n]*?)"
            var pattern = "^"; var last = 0
            for m in ms {
                pattern += NSRegularExpression.escapedPattern(for: kn.substring(with: NSRange(location: last, length: m.range.location - last)))
                pattern += cap; last = m.range.location + m.range.length
            }
            pattern += NSRegularExpression.escapedPattern(for: kn.substring(from: last)) + "$"
            if let re = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) {
                templates.append((re, v, ms.count, literal.count))
            }
        }
        // 긴 틀부터 — 짧은 틀이 더 구체적인 문장을 먼저 삼키지 않게.
        templates.sort { $0.3 > $1.3 }
        let t = Table(exact: exact, templates: templates)
        cache[lang] = t
        return t
    }
}
