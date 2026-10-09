import Foundation
import Observation

/// 서버 이름표(`/labels.json`) — 홈 카드·목적 탭·앨범 이름을 **앱 빌드 없이** 바꾸기 위한 표
/// (오너 지시 2026-10-09 "이것도 하나하나 빌드를 해야함?"). 키 하나에 `{"ko": …, "en": …}`.
/// 서버에 없거나 못 받으면 코드에 적힌 기본 문구를 그대로 쓴다. 마지막으로 받은 표는 저장해 두고
/// 다음 실행 첫 화면부터 쓴다(받기 전 한순간 옛 이름이 보이지 않게).
@Observable
final class LabelStore {
    static let shared = LabelStore()
    private static let cacheKey = "labels.cache"

    private(set) var table: [String: [String: String]]

    private init() {
        if let d = UserDefaults.standard.data(forKey: Self.cacheKey),
           let t = try? JSONDecoder().decode([String: [String: String]].self, from: d) {
            table = t
        } else {
            table = [:]
        }
    }

    func update(_ t: [String: [String: String]]) {
        table = t
        if let d = try? JSONEncoder().encode(t) { UserDefaults.standard.set(d, forKey: Self.cacheKey) }
    }

    /// 서버 표에 값이 있으면 그것, 없으면 기본 문구.
    static func t(_ key: String, _ ko: String, _ en: String) -> String {
        if let v = shared.table[key]?[L.ko ? "ko" : "en"], !v.isEmpty { return v }
        return L.t(ko, en)
    }
}
