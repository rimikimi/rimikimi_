import SwiftUI

/// 브루클린 목적 사진 카탈로그(`/studio-catalog.json`) — 이력서·프로필 칸의 룩·세부 조정 값.
/// 지시문은 서버가 만든다. 앱은 무엇을 골랐는지(id·값)만 보낸다.
struct StudioCatalog: Decodable {
    struct LText: Decodable { let ko: String?; let en: String?
        var text: String { (L.ko ? ko : en) ?? ko ?? en ?? "" } }
    struct Purpose: Decodable { let id: String; let title: LText }
    struct Preset: Decodable { let id: String; let purpose: String; let title: LText; let thumb: String? }
    struct KnobValue: Decodable, Hashable {
        let id: String; let title: LText?; let css: String?; let hex: String?; let name: String?
        static func == (a: KnobValue, b: KnobValue) -> Bool { a.id == b.id }
        func hash(into h: inout Hasher) { h.combine(id) }
        /// 배경 색은 서버에 한국어 이름이 없다 — 시제품과 같은 이름을 붙인다.
        var label: String {
            if let t = title?.text, !t.isEmpty { return t }
            let ko = ["pure white": "화이트", "soft warm light grey": "웜그레이", "warm ivory cream": "아이보리", "soft pastel pink": "파스텔 핑크",
                      "light sky blue": "스카이블루", "soft muted teal": "뮤트 틸", "deep navy blue": "딥네이비", "deep muted purple": "딥퍼플"]
            return (L.ko ? ko[name ?? ""] : name) ?? name ?? id
        }
        var swatch: Color? {
            guard let s = (css ?? hex), s.hasPrefix("#"), let v = UInt32(s.dropFirst(), radix: 16) else { return nil }
            return Color(uiColor: UIColor(hex: v))
        }
    }
    let purposes: [Purpose]
    let presets: [Preset]
    let knobs: [String: [KnobValue]]
    let purposeKnobs: [String: [String]]
    let purposeKnobExclude: [String: [String: [String]]]?

    /// 그 목적의 룩을 격자·담기 줄이 쓰는 컨셉 모양으로.
    func looks(_ purpose: String) -> [Concept] {
        presets.filter { $0.purpose == purpose }.map {
            Concept(syntheticID: "studio:" + $0.id, title: $0.title.ko ?? $0.id, titleEn: $0.title.en,
                    thumb: $0.thumb.flatMap(URL.init(string:)), studioPurpose: purpose, studioPreset: $0.id)
        }
    }
    func values(_ knob: String, purpose: String) -> [KnobValue] {
        let ex = Set(purposeKnobExclude?[purpose]?[knob] ?? [])
        return (knobs[knob] ?? []).filter { !ex.contains($0.id) }
    }
}

/// 조세핀 드레스 한 벌(`/wedding-catalog.json`).
struct WeddingDress: Decodable, Hashable {
    let code: String; let kind: String; let silhouette: String; let color: String; let neckline: String; let sleeve: String; let thumb: String
    var concept: Concept {
        Concept(syntheticID: "dress:" + code, title: "\(code) \(silhouette)", thumb: URL(string: thumb), dressCode: code)
    }
}

/// 세부 조정 항목 → 서버 레시피 키(picbox catalog.js KNOB_KEY 와 1:1).
enum StudioKnob {
    static let recipeKey: [String: String] = [
        "suits": "idSuit", "inners": "idInner", "bgs": "idBg", "expressions": "expressionId", "angles": "angleId",
        "hair": "hairId", "mono": "monochrome", "actorOutfits": "actorOutfitId", "moods": "actorLookId",
        "beautyOutfits": "beautyOutfitId", "beautyLooks": "actorLookId", "retouch": "retouch", "makeup": "makeup",
    ]
    static func title(_ knob: String, purpose: String) -> String {
        switch knob {
        case "suits": return purpose == "audition" ? L.t("의상 색", "Outfit color") : L.t("정장 색", "Suit color")
        case "inners": return L.t("셔츠·블라우스 색", "Shirt · blouse color")
        case "bgs": return L.t("배경 색", "Background")
        case "expressions": return L.t("표정", "Expression")
        case "angles": return L.t("앵글", "Angle")
        case "hair": return L.t("헤어", "Hair")
        case "mono": return L.t("흑백으로", "Black & white")
        case "actorOutfits": return L.t("의상 종류", "Outfit type")
        case "moods": return L.t("분위기", "Mood")
        default: return knob
        }
    }
}

@MainActor
@Observable
final class StudioStore {
    private(set) var catalog: StudioCatalog?
    private(set) var dresses: [WeddingDress] = []
    /// 목적(탭)마다 따로 기억하는 옵션 — 그 탭에서 담은 사진에만 적용된다(오너 정리 2026-10-08).
    var overrides: [String: [String: AnyHashable]] = [:]
    var outfit: [String: UIImage] = [:]
    var groom: UIImage?
    /// 웨딩 드레스 필터 — 실루엣·컬러·넥라인·소매(여러 개).
    var filter: [String: Set<String>] = [:]

    func load() async {
        if catalog == nil, let c: StudioCatalog = await Self.fetch("studio-catalog.json") { catalog = c }
        if dresses.isEmpty, let d: [WeddingDress] = await Self.fetch("wedding-catalog.json") { dresses = d }
    }
    private static func fetch<T: Decodable>(_ path: String) async -> T? {
        guard let (data, resp) = try? await URLSession.shared.data(from: Config.apiBase.appendingPathComponent(path)),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    func hasOptions(_ purpose: String) -> Bool { !(overrides[purpose] ?? [:]).isEmpty || outfit[purpose] != nil }
    func dressList(kind: String) -> [WeddingDress] {
        dresses.filter { d in
            d.kind == kind
            && (filter["sil"].map { $0.isEmpty || $0.contains(d.silhouette) } ?? true)
            && (filter["col"].map { $0.isEmpty || $0.contains(d.color) } ?? true)
            && (filter["neck"].map { $0.isEmpty || $0.contains(d.neckline) } ?? true)
            && (filter["slv"].map { $0.isEmpty || $0.contains(d.sleeve) } ?? true)
        }
    }
    func axisValues(_ axis: String, kind: String) -> [String] {
        var seen = Set<String>(); var out: [String] = []
        for d in dresses where d.kind == kind {
            let v = axis == "sil" ? d.silhouette : axis == "col" ? d.color : axis == "neck" ? d.neckline : d.sleeve
            if seen.insert(v).inserted { out.append(v) }
        }
        return out
    }
}

/// 칩을 줄바꿈하며 흘리는 레이아웃(세부 조정·필터 시트).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0, x + s.width > maxW { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height); widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, maxW), height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + s.width > bounds.maxX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
    }
}
