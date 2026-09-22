import Foundation
import Observation

/// 즐겨찾기(카테고리·컨셉)와 "이미 만들어 본 컨셉" 표시 — 전부 기기에 저장한다(오너 지시 2026-09-22).
///
/// - **카테고리 즐겨찾기**: 홈 앨범 격자에서 위로 올라온다. 별은 카테고리 화면 오른쪽 위.
/// - **컨셉 즐겨찾기**: 홈 맨 위 "⭐ 즐겨찾기" 앨범으로 모인다. 별은 컨셉 화면·브라우저 오른쪽 위.
/// - **이미 만든 컨셉**: 격자 타일에 반투명 그라데이션 + 체크로 표시한다. 서버 갤러리는 24시간만
///   보관되므로(`MyPhotosView` 안내 문구) 서버로는 "예전에 만들었는지"를 알 수 없다 — 생성이
///   끝날 때마다 여기에 id 를 적어 두고, 갤러리를 불러올 때 들어온 id 도 같이 적는다.
@MainActor
@Observable
final class FavoritesStore {
    static let categoriesKey = "fav.categories.v1"
    static let conceptsKey = "fav.concepts.v1"
    static let generatedKey = "gen.concepts.v1"
    /// 즐겨찾기 앨범의 이름 — 실제 카테고리가 아니라 `ConceptStore.concepts(in:)` 가 가로채는 특별한 이름.
    static let albumName = "⭐ 즐겨찾기"

    private(set) var categories: Set<String>
    private(set) var concepts: Set<String>
    private(set) var generated: Set<String>

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        categories = Set(defaults.stringArray(forKey: Self.categoriesKey) ?? [])
        concepts = Set(defaults.stringArray(forKey: Self.conceptsKey) ?? [])
        generated = Set(defaults.stringArray(forKey: Self.generatedKey) ?? [])
    }

    private let defaults: UserDefaults

    func isFavorite(category: String) -> Bool { categories.contains(category) }
    func isFavorite(concept id: String) -> Bool { concepts.contains(id) }
    func hasGenerated(_ id: String) -> Bool { generated.contains(id) }

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

    /// 생성 완료·갤러리 로드에서 부른다. 이미 있으면 아무 일도 안 한다(저장 횟수를 줄인다).
    func markGenerated<S: Sequence>(_ ids: S) where S.Element == String {
        let new = Set(ids.filter { !$0.isEmpty }).subtracting(generated)
        guard !new.isEmpty else { return }
        generated.formUnion(new)
        defaults.set(Array(generated), forKey: Self.generatedKey)
    }
}
