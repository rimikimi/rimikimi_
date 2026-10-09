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
    /// 홈 목적 칸(이력서·프로필 / 프사·소개팅 / 웨딩·커플)에 들어가는지 — 서버 데이터가 정한다(빌드 없이 분류를 바꿀 수 있게).
    let purposes: [String]
    /// 2026-10-09 이식: 리미키미 컨셉이 아닌 담기 항목(브루클린 룩 · 조세핀 드레스)을 같은 격자·담기 줄에 태우려고
    /// 컨셉 모양을 빌린다. 서버엔 conceptId 대신 studio / wedding 으로 보낸다(RimikimiAPI.generate).
    var customThumb: URL? = nil
    var studioPurpose: String? = nil
    var studioPreset: String? = nil
    var dressCode: String? = nil
    var isSynthetic: Bool { studioPreset != nil || dressCode != nil }

    enum CodingKeys: String, CodingKey {
        case id, title, title_en, category, categories, text, mode, fourcutStyle, fourcutStyles, pinFeatured, publishAt, sensitive, purposes
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
        purposes = (try? c.decode([String].self, forKey: .purposes)) ?? []
    }

    /// 브루클린 룩 · 조세핀 드레스용 — 서버 카탈로그에서 만든다.
    init(syntheticID: String, title: String, titleEn: String? = nil, thumb: URL?,
         studioPurpose: String? = nil, studioPreset: String? = nil, dressCode: String? = nil) {
        id = syntheticID; self.title = title; self.titleEn = titleEn; categories = []; text = ""
        mode = nil; fourcutStyle = nil; fourcutStyles = nil; pinFeatured = nil; publishAt = nil
        sensitive = false; purposes = []
        customThumb = thumb; self.studioPurpose = studioPurpose; self.studioPreset = studioPreset; self.dressCode = dressCode
    }

    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    static let isoPlain: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()

    // MARK: 판정 (웹과 동일)
    static let artCategory = "🪄 매직 부스"
    static let coupleCategory = "커플"
    static let fourcutCategory = "📸 인생네컷"

    var isFourcut: Bool { mode == "fourcut" || title.contains("인생네컷") }
    var isDressroom: Bool { mode == "dressroom" }
    /// 커스텀 보정(매직 부스) — 사진 + 고칠 내용을 글로 받아 그 부분만 고친다(2.0.2 build 16~). 서버가 `requires: ["retouch"]` 로
    /// 이 기능을 아는 앱에만 목록을 보낸다(`fetchConcepts` 의 `caps=retouch`).
    var isRetouch: Bool { mode == "retouch" }
    var isCouple: Bool { mode == "couple" || categories.contains(Concept.coupleCategory) }
    /// 매직 부스 = 얼굴 유지 없이 올린 사진을 변환. 드레스룸은 같은 카테고리지만 동작이 반대.
    var isArt: Bool { categories.contains(Concept.artCategory) }
    var isArtTransform: Bool { isArt && !isDressroom }
    var isIdPhoto: Bool { mode == "idphoto" || title.contains("증명사진") }
    var isRestore: Bool { id == "408" || title.range(of: "복원|restor", options: [.regularExpression, .caseInsensitive]) != nil }
    /// 기능 컨셉(매직부스·증명사진·인생네컷)은 "새로 나왔어요" 에서 뺀다.
    var isFeature: Bool { isArt || isIdPhoto || isFourcut }
    /// 셀카 한 장만으로 만들 수 있어 여러 장 담기에 넣을 수 있는지 — 상대 사진·옷 사진·컷 수·글 입력이 필요한 컨셉은 옵션 화면으로.
    var isBatchable: Bool { !isCouple && !isDressroom && !isFourcut && !isArtTransform && !isRetouch }

    /// 화면에 보일 이름 — 영어 UI 면 `title_en`(비어 있으면 한국어 제목). 판정·서버 전송은 계속 `title`.
    var displayTitle: String {
        if !L.ko, let en = titleEn?.trimmingCharacters(in: .whitespacesAndNewlines), !en.isEmpty { return en }
        return title
    }

    var thumbURL: URL { customThumb ?? Config.thumbURL(id) }
    /// 크게 깔리는 자리용 1200px 원본(없으면 `RemoteImage(fallback:)` 이 썸네일로 되돌아간다).
    var largeURL: URL { customThumb ?? Config.largeURL(id) }
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
    /// 이름·배지가 번역 문구라 볼 때마다 만든다(앱 안 언어 전환 — `L`).
    static var all: [BatchOption] { [
        .init(count: 1, cost: 1, label: Copy.photos(1), badge: nil),
        .init(count: 3, cost: 3, label: Copy.photos(3), badge: nil),
        .init(count: 6, cost: 5, label: Copy.photos(6), badge: Copy.percentOff(17)),
        .init(count: 12, cost: 9, label: Copy.photos(12), badge: Copy.percentOff(25)),
    ] }
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
