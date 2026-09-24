import Foundation

/// 앱 언어 — 실행 때 한 번 정한다. 기기 첫 번째 선호 언어가 한국어(ko…)면 한국어, 아니면 영어.
/// 앱 안 언어 전환은 없다. 문구는 전부 `Copy`(Copy.swift) 한 곳에 ko/en 으로 모여 있다.
enum L {
    /// `static let` 이라 처음 읽을 때 한 번만 계산된다(실행 중 기기 언어를 바꿔도 다음 실행부터 반영).
    static let ko: Bool = {
        let first = Locale.preferredLanguages.first?.lowercased() ?? ""
        return first.hasPrefix("ko")
    }()

    /// 웹뷰 도구·서버에 넘길 언어 코드.
    static var code: String { ko ? "ko" : "en" }

    /// 한국어면 `ko`, 아니면 `en`.
    @inline(__always)
    static func t(_ ko: String, _ en: String) -> String { L.ko ? ko : en }
}
