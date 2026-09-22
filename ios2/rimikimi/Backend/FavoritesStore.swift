import Foundation
import Observation

/// 즐겨찾기(카테고리·컨셉)와 "이미 만들어 본 컨셉" 표시 — 전부 기기에 저장한다(오너 지시 2026-09-22).
///
/// - **카테고리 즐겨찾기**: 홈 앨범 격자에서 위로 올라온다. 별은 카테고리 화면 오른쪽 위.
/// - **컨셉 즐겨찾기**: 홈 맨 위 "⭐ 즐겨찾기" 앨범으로 모인다. 별은 컨셉 화면·브라우저 오른쪽 위.
/// - **이미 만든 컨셉**: 격자 타일에 반투명 그라데이션 + 체크로 표시한다. 서버 갤러리는 24시간만
///   보관되므로(`MyPhotosView` 안내 문구) 서버로는 "예전에 만들었는지"를 알 수 없다 — 생성이
///   끝날 때마다 여기에 id 를 적어 두고, 갤러리를 불러올 때 들어온 id 도 같이 적는다.
///   ⚠️ 표시 규칙(오너 지시 2026-09-22): **앨범에 저장까지 한 것만 영구 표시**한다. 저장 안 한 것은
///   보관 기간(24시간) 동안만 표시하고 지나면 표시를 **되돌린다** — 갤러리에서 사라진 결과를
///   "만든 컨셉"으로 남겨 두면 사용자가 찾으러 갔다가 없어서 헛걸음한다.
@MainActor
@Observable
final class FavoritesStore {
    static let categoriesKey = "fav.categories.v1"
    static let conceptsKey = "fav.concepts.v1"
    /// v1 은 "만들었다" 만 기록한 id 배열이었다. v2 는 만든 시각 + 저장 여부를 같이 둔다.
    static let generatedKey = "gen.concepts.v2"
    /// 저장 안 한 컨셉의 표시 수명 — 서버 갤러리 보관 기간과 같아야 한다(`api/_lib/gallery.js` TTL).
    static let unsavedTTL: TimeInterval = 24 * 60 * 60

    /// 만든 기록 한 건.
    struct Mark: Codable {
        /// 마지막으로 만든 시각. 다시 만들면 갱신된다(갤러리에 다시 24시간 남으므로).
        var at: Date
        /// 앨범에 저장했는가. true 면 시간과 무관하게 계속 표시한다.
        var saved: Bool
    }
    /// 즐겨찾기 앨범의 이름 — 실제 카테고리가 아니라 `ConceptStore.concepts(in:)` 가 가로채는 특별한 이름.
    static let albumName = "⭐ 즐겨찾기"

    private(set) var categories: Set<String>
    private(set) var concepts: Set<String>
    private(set) var marks: [String: Mark]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        categories = Set(defaults.stringArray(forKey: Self.categoriesKey) ?? [])
        concepts = Set(defaults.stringArray(forKey: Self.conceptsKey) ?? [])
        if let data = defaults.data(forKey: Self.generatedKey),
           let saved = try? JSONDecoder().decode([String: Mark].self, from: data) {
            marks = saved
        } else {
            marks = [:]
        }
        pruneExpired()
    }

    /// 저장 안 한 채 보관 기간이 지난 기록은 지운다 — 표시가 원래대로 돌아간다.
    private func pruneExpired() {
        let cutoff = Date().addingTimeInterval(-Self.unsavedTTL)
        let kept = marks.filter { $0.value.saved || $0.value.at > cutoff }
        guard kept.count != marks.count else { return }
        marks = kept
        persistMarks()
    }

    private func persistMarks() {
        if let data = try? JSONEncoder().encode(marks) { defaults.set(data, forKey: Self.generatedKey) }
    }

    private let defaults: UserDefaults

    func isFavorite(category: String) -> Bool { categories.contains(category) }
    func isFavorite(concept id: String) -> Bool { concepts.contains(id) }

    /// "만든 컨셉" 표시 여부 — 앨범에 저장했으면 계속, 아니면 24시간 안일 때만.
    func hasGenerated(_ id: String) -> Bool {
        guard let m = marks[id] else { return false }
        return m.saved || Date().timeIntervalSince(m.at) < Self.unsavedTTL
    }

    func toggle(category: String) {
        if categories.contains(category) { categories.remove(category) } else { categories.insert(category) }
        defaults.set(Array(categories), forKey: Self.categoriesKey)
        HapticPlayer.selection()
    }

    func toggle(concept id: String) {
        if concepts.contains(id) { concepts.remove(id) } else { concepts.insert(id) }
        defaults.set(Array(concepts), forKey: Self.conceptsKey)
        HapticPlayer.selection()
    }

    /// 생성 완료·갤러리 로드에서 부른다. `at` 은 그 결과가 만들어진 시각(갤러리 항목은 `createdAt`).
    /// 더 최근 기록만 남긴다 — 다시 만들면 갤러리에 24시간이 새로 생기므로 표시도 같이 연장된다.
    func markGenerated(_ ids: [(id: String, at: Date)]) {
        var changed = false
        for (id, at) in ids where !id.isEmpty {
            if let old = marks[id] {
                guard at > old.at else { continue }
                marks[id] = Mark(at: at, saved: old.saved)
            } else {
                marks[id] = Mark(at: at, saved: false)
            }
            changed = true
        }
        if changed { persistMarks() }
        pruneExpired()
    }

    func markGenerated<S: Sequence>(_ ids: S) where S.Element == String {
        markGenerated(ids.map { ($0, Date()) })
    }

    /// 앨범에 저장했다 — 이제 시간이 지나도 표시가 남는다.
    func markSaved(_ id: String?) {
        guard let id, !id.isEmpty else { return }
        marks[id] = Mark(at: marks[id]?.at ?? Date(), saved: true)
        persistMarks()
    }
}
