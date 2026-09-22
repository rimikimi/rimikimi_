import Foundation

/// 시즌 — 명절·기념일 카테고리가 **그 기간에만 맨 앞으로** 올라오게 하는 표(오너 지시 2026-09-22).
///
/// 추천·새로 나왔어요 줄은 그대로 두고, 그 아래 카테고리(앨범 격자·칩 줄)에서만 순서가 바뀐다.
/// 표는 서버(`/seasons.json`)에서 받는다 — 설날·추석처럼 해마다 날짜가 움직이는 시즌을 앱 업데이트
/// 없이 고치기 위해서다. 못 받으면 번들 스냅샷(`seasons.fallback.json`)을 쓴다.
///
/// 날짜는 **KST 기준 날짜(`yyyy-MM-dd`)** 로만 적는다(시각·시간대 없음). `end` 는 그날까지 포함.
struct Season: Decodable, Hashable {
    /// 실제 컨셉에 붙어 있는 카테고리 이름과 **정확히 같아야** 한다. 다르면 조용히 아무 일도 안 일어난다.
    let category: String
    let name: String
    let start: String
    let end: String

    private static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// `now` 가 시작일 00:00 ~ 종료일 24:00(KST) 안인가.
    func isActive(at now: Date = Date()) -> Bool {
        guard let s = Self.fmt.date(from: start), let e = Self.fmt.date(from: end) else { return false }
        return now >= s && now < e.addingTimeInterval(24 * 60 * 60)
    }
}
