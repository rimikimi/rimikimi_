import SwiftUI
import CoreMotion
import Observation

/// 홈 앨범 '창문' 연출의 공용 상태 — 지금 날씨, 오늘 일출·일몰(광원), 폰 기울기(중력).
///
/// 2026-10-22 오너: "비 오면 앨범이 창문처럼 물이 고였다가 폰을 기울이면 쪼르르 쏟아지고, 눈 오면 소복이 쌓이고,
/// 햇빛 쨍쨍하면 그림자를 세게, 시간에 따라 광원 위치가 변화(진짜 일출·일몰 데이터)".
///
/// - 날씨·일출·일몰: 서버 `/api/ambient`(접속 IP 의 대략 좌표 → Open-Meteo). 위치 권한을 묻지 않는다. 10분 캐시.
/// - 기울기: `CMDeviceMotion.gravity`(자이로 회전 속도가 아니라 **기울어진 방향**). 화면 좌표(오른쪽 +x, 아래 +y)로 바꿔 둔다.
///   중력은 관찰 대상에서 뺀다(@ObservationIgnored) — 초당 30번 바뀌는 값이 뷰를 다시 그리게 하면 안 된다.
///   물 시뮬레이션이 매 프레임 직접 읽는다.
/// - 동작 줄이기·저전력 모드면 움직임(센서·애니메이션)을 끄고 정지 그림만.
@MainActor
@Observable
final class Ambient {
    static let shared = Ambient()

    enum Weather: String, CaseIterable { case clear, cloud, rain, snow, fog, storm }

    /// 서버가 준 실제 날씨.
    private(set) var weather: Weather = .clear
    private(set) var sunrise: Date?
    private(set) var sunset: Date?
    /// 바람(km/h)·불어오는 방향(도, 0=북). 미리보기 강제값이 있으면 그것.
    private(set) var wind: Double = 0
    private(set) var windDir: Double = 0
    @ObservationIgnored var previewWind: Double?
    /// 미리보기 강제(TestFlight 설정·dev 라우트). nil = 실제 날씨.
    var preview: Weather? {
        didSet { UserDefaults.standard.set(preview?.rawValue, forKey: "ambient.preview") }
    }
    /// 화면에 쓸 날씨.
    var current: Weather { preview ?? weather }

    /// 화면 좌표 중력(크기 ≤ 1). 폰을 세워 들면 (0, 1), 오른쪽으로 기울이면 x 가 +.
    @ObservationIgnored private(set) var gravity = CGVector(dx: 0, dy: 1)
    /// dev 라우트로 기울기를 고정(시뮬레이터엔 센서가 없다).
    @ObservationIgnored var fakeGravity: CGVector?

    @ObservationIgnored private let motion = CMMotionManager()
    @ObservationIgnored private var motionUsers = 0
    @ObservationIgnored private var lastFetch: Date?

    private init() {
        if let raw = UserDefaults.standard.string(forKey: "ambient.preview") { preview = Weather(rawValue: raw) }
    }

    /// 움직임을 꺼야 하는가 — 동작 줄이기·저전력.
    var reduced: Bool {
        UIAccessibility.isReduceMotionEnabled || ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    // MARK: 날씨

    func refresh() async {
        if let lastFetch, Date().timeIntervalSince(lastFetch) < 600 { return }
        lastFetch = Date()
        struct R: Decodable { let weather: String; let sunrise: Double?; let sunset: Double?; let wind: Double?; let windDir: Double? }
        do {
            var req = URLRequest(url: Config.apiBase.appendingPathComponent("api/ambient"))
            req.timeoutInterval = 6
            let (data, _) = try await URLSession.shared.data(for: req)
            let r = try JSONDecoder().decode(R.self, from: data)
            weather = Weather(rawValue: r.weather) ?? .clear
            sunrise = r.sunrise.map { Date(timeIntervalSince1970: $0) }
            sunset = r.sunset.map { Date(timeIntervalSince1970: $0) }
            wind = r.wind ?? 0; windDir = r.windDir ?? 0
            AppLog.api.info("ambient weather=\(r.weather, privacy: .public)")
        } catch {
            AppLog.api.error("ambient failed \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: 기울기

    func beginMotion() {
        motionUsers += 1
        guard motionUsers == 1, !reduced, motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 30.0
        motion.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in
            guard let self, let g = m?.gravity else { return }
            // 기기 좌표(오른쪽 +x, 위 +y) → 화면 좌표(아래 +y). 폰을 눕히면 z 로 빠져 x·y 가 작아진다 = 물이 덜 흐른다.
            // 부드럽게(저역 통과) — 손떨림·센서 잡음에 물 방향이 출렁이지 않게
            let raw = CGVector(dx: g.x, dy: -g.y)
            self.gravity = CGVector(dx: self.gravity.dx * 0.85 + raw.dx * 0.15, dy: self.gravity.dy * 0.85 + raw.dy * 0.15)
        }
    }

    func endMotion() {
        motionUsers = max(0, motionUsers - 1)
        if motionUsers == 0 { motion.stopDeviceMotionUpdates() }
    }

    /// 시뮬레이션이 읽는 중력 — 고정값이 있으면 그것.
    /// 폰을 거의 눕히면(화면 평면 성분이 작으면) 방향이 무의미하게 빙빙 돈다 — 그땐 '아래'로 고정하고 세기만 줄인다.
    var simGravity: CGVector {
        let g = fakeGravity ?? gravity
        let len = hypot(g.dx, g.dy)
        if len < 0.35 { return CGVector(dx: 0, dy: max(0.2, len)) }
        return g
    }
    /// 바람이 화면 가로로 미는 정도(-1…1). 화면엔 동서만 의미 있다 — 서풍(270°에서 불어옴)이면 오른쪽(+)으로.
    /// 10km/h 아래는 무시, 45km/h 이상이면 최대.
    var windPush: CGFloat {
        let v = previewWind ?? wind
        guard v > 10 else { return 0 }
        let k = min(1, (v - 10) / 35)
        let from = (previewWind != nil ? 270 : windDir) * .pi / 180
        return CGFloat(-sin(from) * k)
    }

    // MARK: 무드(추천용)

    /// 지금 시간대 — 실제 일출·일몰 기준(모르면 시계로 어림).
    func phase(at now: Date = Date()) -> String {
        if let rise = sunrise, let set = sunset, set > rise {
            if now < rise.addingTimeInterval(-1800) || now > set.addingTimeInterval(2400) { return "night" }
            if now < rise.addingTimeInterval(2.5 * 3600) { return "morning" }
            if now > set.addingTimeInterval(-5400) { return "golden" }
            return "day"
        }
        let h = Calendar.current.component(.hour, from: now)
        return h < 6 || h >= 19 ? "night" : h < 10 ? "morning" : h >= 17 ? "golden" : "day"
    }

    /// 컨셉이 지금 무드에 얼마나 맞나(0 = 무관). 날씨가 더 중요하고, 비·눈 오는 날엔 실내 아늑한 컨셉도 어울린다.
    func moodScore(_ m: Concept.Mood?, now: Date = Date()) -> Int {
        guard let m else { return 0 }
        let wx: String = switch current { case .rain, .storm: "rain"; case .snow: "snow"; case .clear: "sunny"; case .cloud, .fog: "cloudy" }
        var s = 0
        if m.wx == wx { s += 3 } else if (wx == "rain" || wx == "snow") && m.wx == "indoor" { s += 1 }
        if m.tod == phase(at: now) { s += 2 }
        return s
    }

    // MARK: 광원

    /// 앨범 카드 그림자 — 해가 왼쪽(아침)에서 오른쪽(저녁)으로 지나가는 것처럼, 그림자는 반대쪽으로 길게.
    /// 일출·일몰 근처일수록 길고, 한낮엔 짧고 아래로. 맑음일수록 진하다. 밤엔 아주 옅게 바로 아래.
    struct Light { var dx: CGFloat; var dy: CGFloat; var radius: CGFloat; var opacity: Double; var warm: Double }

    func light(at now: Date = Date()) -> Light {
        let w = current
        let clarity: Double = switch w { case .clear: 1; case .cloud: 0.55; case .fog: 0.35; case .rain, .snow, .storm: 0.3 }
        guard let rise = sunrise, let set = sunset, set > rise, now > rise, now < set else {
            return Light(dx: 0, dy: 3, radius: 6, opacity: 0.10, warm: 0)  // 밤 — 바로 아래 옅게
        }
        let t = now.timeIntervalSince(rise) / set.timeIntervalSince(rise)      // 0 일출 … 1 일몰
        let elevation = sin(Double.pi * t)                                      // 0 … 1 … 0
        let azimuth = cos(Double.pi * t)                                        // +1 왼쪽에서 … -1 오른쪽에서
        let length = 4 + 10 * (1 - elevation)                                   // 낮을수록 그림자가 길다
        let golden = max(0, 1 - elevation / 0.35)                               // 일출·일몰 근처 따뜻한 빛
        return Light(dx: CGFloat(azimuth * length), dy: CGFloat(3 + 4 * elevation),
                     radius: CGFloat(5 + 5 * (1 - elevation)),
                     opacity: 0.08 + 0.20 * clarity, warm: golden * clarity)
    }
}
