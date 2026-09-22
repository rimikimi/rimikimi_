import Foundation
import Observation

/// 컨셉 목록 — 원격 우선(`/concepts.json`, 공개 시각 지난 것만), 실패하면 번들 스냅샷.
/// 홈 레이아웃(추천·새로 나왔어요·카테고리 줄)은 `src/PortraitStudio.jsx` homeData 와 같은 규칙.
@MainActor
@Observable
final class ConceptStore {
    private(set) var concepts: [Concept] = []
    private(set) var popularIDs: [String] = []
    private(set) var isLoading = true
    private(set) var loadedFromBundle = false

    struct Category: Identifiable, Hashable {
        let name: String
        let count: Int
        var id: String { name }
    }
    struct Row: Identifiable {
        let name: String
        let items: [Concept]
        var id: String { name }
    }
    /// 홈의 "앨범" 타일 하나 — 표지 1장 + 이름 + 장수(네이티브 사진 앱 앨범 탭 참고).
    struct AlbumTile: Identifiable {
        let name: String
        let count: Int
        /// 표지는 2열 타일(≈185pt = 555px)이라 400px 썸네일로는 모자란다 — 1200px 을 먼저 쓰고
        /// 없으면 썸네일로 되돌아간다(`RemoteImage(fallback:)`).
        let coverURL: URL?
        let coverFallbackURL: URL?
        var id: String { name }
    }

    /// 증명사진은 목록에서 뺀다(웹과 동일 — 별도 앱으로 안내하던 항목).
    var pool: [Concept] { concepts.filter { !$0.isIdPhoto } }

    var categories: [Category] {
        var counts: [String: Int] = [:]
        for c in pool { for cat in c.categories { counts[cat, default: 0] += 1 } }
        return counts.map { Category(name: $0.key, count: $0.value) }
            .sorted { (CategoryOrder.rank($0.name), $0.name) < (CategoryOrder.rank($1.name), $1.name) }
    }

    /// 추천 5: 서버 인기순 → 부족하면 최신으로 채움 → `pinFeatured` 자리 고정.
    var featured: [Concept] {
        let byID = Dictionary(uniqueKeysWithValues: pool.map { ($0.id, $0) })
        var list = popularIDs.compactMap { byID[$0] }
        if list.count < 5 {
            let have = Set(list.map(\.id))
            list += pool.sorted(by: Self.byNewest).filter { !have.contains($0.id) }
        }
        list = Array(list.prefix(5))
        let pinned = pool.filter { ($0.pinFeatured ?? 0) > 0 }.sorted { ($0.pinFeatured ?? 0) < ($1.pinFeatured ?? 0) }
        for p in pinned {
            list.removeAll { $0.id == p.id }
            let at = min(max(1, p.pinFeatured ?? 1), list.count + 1)
            list.insert(p, at: at - 1)
        }
        return Array(list.prefix(5))
    }

    /// 새로 나왔어요 10: 기능 컨셉 제외, 최신순.
    var newest: [Concept] {
        Array(pool.filter { !$0.isFeature }.sorted(by: Self.byNewest).prefix(10))
    }

    /// 카테고리별 줄 — 최근에 새 컨셉이 들어온 줄이 위로, 줄마다 최신 10개.
    var rows: [Row] {
        var groups: [String: (items: [Concept], latest: Double)] = [:]
        for c in pool {
            for cat in c.categories {
                var g = groups[cat] ?? ([], -.infinity)
                g.items.append(c)
                g.latest = max(g.latest, c.sortKey)
                groups[cat] = g
            }
        }
        return groups.map { Row(name: $0.key, items: Array($0.value.items.sorted(by: Self.byNewest).prefix(10))) }
            .sorted { (groups[$0.name]?.latest ?? 0) > (groups[$1.name]?.latest ?? 0) }
    }

    /// 홈 카테고리 섹션 — "추천"·"새로 나왔어요"를 뺀 나머지를 네이티브 사진 앱 "앨범" 탭처럼
    /// 표지 1장 + 이름 + 장수로 보여준다(오너 지시 2026-09-19). 정렬은 `rows`와 동일(최근에 새
    /// 컨셉이 들어온 카테고리가 위) — 장수는 `rows.items`가 10개로 잘려 있어 `categories`의
    /// 진짜 총합을 따로 조회한다.
    var albumTiles: [AlbumTile] {
        let counts = Dictionary(uniqueKeysWithValues: categories.map { ($0.name, $0.count) })
        var tiles = rows.map { AlbumTile(name: $0.name, count: counts[$0.name] ?? $0.items.count,
                                         coverURL: $0.items.first?.largeURL, coverFallbackURL: $0.items.first?.thumbURL) }
        // 즐겨찾기한 카테고리를 위로(오너 지시 2026-09-22 "실제로 배열도 바꿔주고"). 그 안에서는 원래 순서.
        // (`sort` 는 안정 정렬이 아니라 같은 그룹 안 순서가 흔들린다 — 두 덩어리로 갈라 붙인다.)
        let favCats = favoriteCategories()
        tiles = tiles.filter { favCats.contains($0.name) } + tiles.filter { !favCats.contains($0.name) }
        // 고른 컨셉이 있으면 맨 앞에 "⭐ 즐겨찾기" 앨범.
        let favItems = concepts(in: FavoritesStore.albumName)
        if let cover = favItems.first {
            tiles.insert(AlbumTile(name: FavoritesStore.albumName, count: favItems.count,
                                   coverURL: cover.largeURL, coverFallbackURL: cover.thumbURL), at: 0)
        }
        return tiles
    }

    /// 즐겨찾기 앨범은 카테고리가 아니라 사용자가 고른 목록이다 — `AppState` 가 주입한다.
    /// (뷰들이 전부 `concepts(in:)` 을 부르고 있어 여기서 가로채는 게 변경이 가장 작다.)
    var favoriteIDs: () -> Set<String> = { [] }
    var favoriteCategories: () -> Set<String> = { [] }

    func concepts(in category: String) -> [Concept] {
        if category == FavoritesStore.albumName {
            let ids = favoriteIDs()
            return pool.filter { ids.contains($0.id) }.sorted(by: Self.byNewest)
        }
        return pool.filter { $0.categories.contains(category) }
    }

    func concept(id: String) -> Concept? { concepts.first { $0.id == id } }

    /// "비슷한 컨셉" — 같은 카테고리에서 본인 제외, 최신 10개.
    func similar(to c: Concept) -> [Concept] {
        guard let cat = c.categories.first else { return [] }
        return Array(concepts(in: cat).filter { $0.id != c.id }.sorted(by: Self.byNewest).prefix(10))
    }

    static func byNewest(_ a: Concept, _ b: Concept) -> Bool {
        if a.sortKey != b.sortKey { return a.sortKey > b.sortKey }
        return (Int(a.id) ?? 0) > (Int(b.id) ?? 0)
    }

    // MARK: 로드

    func load() async {
        isLoading = concepts.isEmpty
        defer { isLoading = false }
        if let remote = try? await RimikimiAPI.shared.fetchConcepts(), !remote.isEmpty {
            concepts = remote
            loadedFromBundle = false
        } else if concepts.isEmpty, let bundled = Self.loadBundled() {
            concepts = bundled
            loadedFromBundle = true
        }
        if let ids = try? await RimikimiAPI.shared.fetchPopular() { popularIDs = ids }
    }

    static func loadBundled() -> [Concept]? {
        guard let url = Bundle.main.url(forResource: "concepts.fallback", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode([Concept].self, from: data)
    }
}
