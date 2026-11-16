import Foundation
import Observation

/// 프로필 "언어" 행의 선택지. 기본은 `.system`(기기 언어를 따른다).
enum AppLanguage: String, CaseIterable, Identifiable {
    // 2026-11-16 오너: 일본어·대만(번체)·인도네시아어·태국어·말레이어 추가. 원값 = 번역 사전 언어 코드.
    case system, ko, en, ja, zhHant = "zh-Hant", indonesian = "id", th, ms
    var id: String { rawValue }
}

/// 앱 언어 — 기본은 기기 첫 번째 선호 언어가 한국어(ko…)면 한국어, 아니면 영어.
/// 2026-09-30 오너 지시로 프로필에서 한국어/English 로 고를 수 있다(1.x 웹 프로필의 언어 선택과 같은 선택지).
/// 문구는 전부 `Copy`(Copy.swift) 한 곳에 ko/en 으로 모여 있다.
///
/// 고르면 **바로** 바뀐다(재시작 없음): 뷰가 문구를 그리며 `L.ko` 를 읽으면 Observation 이 그걸 의존성으로
/// 잡으므로, 언어가 바뀌면 문구를 쓰는 화면이 제자리에서 다시 그려진다 — 화면을 통째로 새로 만들지 않아
/// 스크롤·열린 시트·입력 중인 글이 그대로 남는다.
/// ⚠️ 그래서 번역 문구를 `static let` 에 담아 두면 안 된다(처음 읽은 언어로 굳는다) — 목록은 `static var { }` 로.
enum L {
    /// 문구마다 읽는 값이라 UserDefaults 를 매번 읽지 않고 여기 들고 있는다. 바꿀 땐 반드시 `L.set`.
    @Observable
    final class Current {
        fileprivate(set) var preference: AppLanguage
        fileprivate(set) var ko: Bool
        /// 실제로 쓰는 언어 코드 — ko · en · ja · zh-Hant · id · th · ms.
        fileprivate(set) var lang: String
        init(preference: AppLanguage) {
            self.preference = preference
            let l = L.resolveLang(preference)
            lang = l
            ko = l == "ko"
        }
    }

    private static let key = "app.language"
    static let current = Current(preference: AppLanguage(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .system)

    /// 기기 언어 — 실행 때 한 번 본다(기기 언어를 바꾸면 iOS 가 앱을 새로 띄운다).
    static let systemKo: Bool = { systemLang == "ko" }()
    /// 기기 첫 선호 언어 → 지원 언어 코드(없으면 en). 중국어는 번체(대만·홍콩·마카오)만 — 간체는 영어.
    static let systemLang: String = {
        let first = Locale.preferredLanguages.first?.lowercased() ?? ""
        if first.hasPrefix("ko") { return "ko" }
        if first.hasPrefix("ja") { return "ja" }
        if first.hasPrefix("zh-hant") || first.hasPrefix("zh-tw") || first.hasPrefix("zh-hk") || first.hasPrefix("zh-mo") { return "zh-Hant" }
        if first.hasPrefix("id") || first.hasPrefix("in-") || first == "in" { return "id" }
        if first.hasPrefix("th") { return "th" }
        if first.hasPrefix("ms") { return "ms" }
        return "en"
    }()

    static var preference: AppLanguage { current.preference }
    static var ko: Bool { current.ko }
    static var lang: String { current.lang }

    /// 프로필 "언어" 행 → 저장하고 바로 적용.
    static func set(_ p: AppLanguage) {
        UserDefaults.standard.set(p.rawValue, forKey: key)
        current.preference = p
        current.lang = resolveLang(p)
        current.ko = current.lang == "ko"
    }

    fileprivate static func resolveLang(_ p: AppLanguage) -> String {
        p == .system ? systemLang : p.rawValue
    }

    /// 웹뷰 도구·서버에 넘길 언어 코드.
    static var code: String { ko ? "ko" : "en" }

    /// 한국어면 `ko`, 아니면 `en`.
    @inline(__always)
    static func t(_ ko: String, _ en: String) -> String {
        let l = current.lang
        if l == "ko" { return ko }
        if l == "en" { return en }
        return I18N.tr(en, l)
    }
    /// 영어 문구(서버 이름표 등)를 지금 언어로 — 사전에 없으면 영어 그대로.
    static func tr(_ en: String) -> String {
        let l = current.lang
        return (l == "ko" || l == "en") ? en : I18N.tr(en, l)
    }
}
