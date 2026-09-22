import Foundation

/// `/concepts.json` 한 항목. `id` 는 서버가 숫자/문자열을 섞어 보내므로 문자열로 정규화한다.
/// 판정 규칙(인생네컷·드레스룸·커플·매직부스·증명사진·복원)은 `src/PortraitStudio.jsx` 와 같다.
struct Concept: Identifiable, Hashable, Decodable {
    let id: String
    let title: String
    let titleEn: String?
    let categories: [String]
    /// 프롬프트 — 그대로 `/api/generate` 의 `prompt` 로 나간다.
    let text: String
    let mode: String?
    let fourcutStyle: String?
    let fourcutStyles: [FourcutStyle]?
    let pinFeatured: Int?
    let publishAt: Date?
    let sensitive: Bool

    enum CodingKeys: String, CodingKey {
        case id, title, title_en, category, categories, text, mode, fourcutStyle, fourcutStyles, pinFeatured, publishAt, sensitive
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let n = try? c.decode(Int.self, forKey: .id) { id = String(n) }
        else { id = try c.decode(String.self, forKey: .id) }
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        titleEn = try? c.decode(String.self, forKey: .title_en)
        if let cats = try? c.decode([String].self, forKey: .categories), !cats.isEmpty {
            categories = cats
        } else if let one = try? c.decode(String.self, forKey: .category) {
            categories = [one]
        } else {
            categories = []
        }
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        mode = try? c.decode(String.self, forKey: .mode)
        fourcutStyle = try? c.decode(String.self, forKey: .fourcutStyle)
        fourcutStyles = try? c.decode([FourcutStyle].self, forKey: .fourcutStyles)
        if let n = try? c.decode(Int.self, forKey: .pinFeatured) { pinFeatured = n }
        else if let d = try? c.decode(Double.self, forKey: .pinFeatured) { pinFeatured = Int(d) }
        else { pinFeatured = nil }
        if let s = try? c.decode(String.self, forKey: .publishAt) { publishAt = Concept.iso.date(from: s) ?? Concept.isoPlain.date(from: s) }
        else { publishAt = nil }
        sensitive = (try? c.decode(Bool.self, forKey: .sensitive)) ?? false
    }

    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    static let isoPlain: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()

    // MARK: 판정 (웹과 동일)
    static let artCategory = "🪄 매직 부스"
    static let coupleCategory = "커플"
    static let fourcutCategory = "📸 인생네컷"

    var isFourcut: Bool { mode == "fourcut" || title.contains("인생네컷") }
    var isDressroom: Bool { mode == "dressroom" }
    var isCouple: Bool { mode == "couple" || categories.contains(Concept.coupleCategory) }
    /// 매직 부스 = 얼굴 유지 없이 올린 사진을 변환. 드레스룸은 같은 카테고리지만 동작이 반대.
    var isArt: Bool { categories.contains(Concept.artCategory) }
    var isArtTransform: Bool { isArt && !isDressroom }
    var isIdPhoto: Bool { mode == "idphoto" || title.contains("증명사진") }
    var isRestore: Bool { id == "408" || title.range(of: "복원|restor", options: [.regularExpression, .caseInsensitive]) != nil }
    /// 기능 컨셉(매직부스·증명사진·인생네컷)은 "새로 나왔어요" 에서 뺀다.
    var isFeature: Bool { isArt || isIdPhoto || isFourcut }

    var thumbURL: URL { Config.thumbURL(id) }
    /// 크게 깔리는 자리용 1200px 원본(없으면 `RemoteImage(fallback:)` 이 썸네일로 되돌아간다).
    var largeURL: URL { Config.largeURL(id) }
    var sortKey: Double { publishAt?.timeIntervalSince1970 ?? (Double(id) ?? 0) }

    static func == (a: Concept, b: Concept) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

struct FourcutStyle: Hashable, Decodable {
    let key: String
    let label: String
    let emoji: String?
}

/// 서버 목록이 없을 때의 번들 목록(`src/fourcut.js` FOURCUT_STYLES 의 key/label/emoji).
enum FourcutDefaults {
    static let counts = [2, 3, 4, 6]
    static let styles: [FourcutStyle] = [
        .init(key: "cute", label: "큐티", emoji: "🎀"), .init(key: "luxury", label: "럭셔리", emoji: "🖤"),
        .init(key: "funky", label: "펑키", emoji: "⚡"), .init(key: "playful", label: "플레이풀", emoji: "🎉"),
        .init(key: "birthday", label: "버스데이", emoji: "🎂"), .init(key: "film", label: "필름", emoji: "🎞"),
        .init(key: "summer", label: "썸머", emoji: "🌊"), .init(key: "mono", label: "모노", emoji: "◻️"),
        .init(key: "school", label: "교복", emoji: "🎒"), .init(key: "couple", label: "커플", emoji: "💑"),
        .init(key: "wedding", label: "웨딩", emoji: "💍"), .init(key: "party", label: "파티", emoji: "🥂"),
        .init(key: "beach", label: "여름", emoji: "🏖"), .init(key: "vintage", label: "빈티지", emoji: "📻"),
        .init(key: "christmas", label: "크리스마스", emoji: "🎄"), .init(key: "newtro", label: "뉴트로", emoji: "🕹"),
        .init(key: "editorial", label: "화보", emoji: "📷"),
    ]
    static func resolve(_ remote: [FourcutStyle]?) -> [FourcutStyle] {
        guard let remote else { return styles }
        let list = remote.filter { !$0.key.isEmpty && !$0.label.isEmpty }
        return list.isEmpty ? styles : list
    }
}

/// 묶음 생성 요금 — 서버(`api/generate.js` BATCH_COST)와 반드시 일치.
struct BatchOption: Hashable {
    let count: Int
    let cost: Int
    let label: String
    let badge: String?
    static let all: [BatchOption] = [
        .init(count: 1, cost: 1, label: "1장", badge: nil),
        .init(count: 3, cost: 3, label: "3장", badge: nil),
        .init(count: 6, cost: 5, label: "6장", badge: "17% 할인"),
        .init(count: 12, cost: 9, label: "12장", badge: "25% 할인"),
    ]
    static func cost(for count: Int) -> Int { all.first { $0.count == count }?.cost ?? count }
}

/// 카테고리 칩 노출 순서(`CATEGORY_ORDER`). 여기 없는 카테고리는 뒤에 붙는다. "🎞️ 필터" 칩은 2.0 에 없다.
enum CategoryOrder {
    static let order: [String] = [
        "🪄 매직 부스", "📸 인생네컷", "세계여행", "일상 스냅", "스튜디오 프로필", "하이패션 / 화보",
        "웨딩 / 브라이덜", "커플", "남성", "스트릿 패션", "파티 / 이벤트", "비치 / 리조트", "예술 / 클래식", "판타지 / 콘셉트",
    ]
    static func rank(_ name: String) -> Int { order.firstIndex(of: name) ?? 999 }
}
