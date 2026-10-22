import SwiftUI

/// 홈 화면 '비 오는 유리창' — 화면 전체가 유리, 앨범 카드는 루버(차양) 아래라 사진엔 물이 안 묻는다(2026-10-22 오너).
///
/// - 빗방울은 **화면 좌표(pt)** 의 유리 위에 맺힌다. 작게 '톡' 생겨 커지고, 이웃과 합쳐지고, 문턱보다 커지면
///   중력(폰 기울기) 방향으로 눈물방울 모양으로 흘러내리며 작은 물자국을 남긴다.
/// - 카드 자리(가림막)에는 새 방울이 생기지 않는다. 흘러내리던 방울이 카드 **윗면**에 닿으면 그 카드의 '고인 물'이 된다.
/// - 카드 윗면 고인 물: 24칸 높이. 기울이면 낮은 쪽으로 출렁이며 몰리고, 넘치거나 많이 기울면 그 모서리에서
///   방울이 되어 **카드 옆면을 타고 다시 흘러내린다**(유리 위 방울로 돌아감).
/// - 눈: 눈송이가 배경으로 내리고(카드 뒤), 카드 윗면에 소복이 쌓이며, 많이 기울면 미끄러져 떨어진다.
///
/// 한 프레임에 한 번(`step`) — 배경 뷰가 부른다. 카드 윗면 뷰는 같은 프레임 상태를 읽기만 한다.
@MainActor
final class RainWorld {
    static let shared = RainWorld()

    enum Mode { case rain, snow }

    struct Drop { var x, y, r: CGFloat; var vx: CGFloat = 0; var vy: CGFloat = 0; var sliding = false; var grow: CGFloat = 0; var life: CGFloat = 0 }
    struct Flake { var x, y, r, phase, speed: CGFloat }
    struct Ledge {
        var frame: CGRect                       // 화면 좌표
        var level = [CGFloat](repeating: 0, count: RainWorld.cols)   // 물 높이(pt) 또는 눈 높이(pt)
        var vel = [CGFloat](repeating: 0, count: RainWorld.cols)
        var seen: Date = .distantPast
    }

    nonisolated static let cols = 24
    var mode: Mode = .rain
    private(set) var drops: [Drop] = []
    private(set) var flakes: [Flake] = []
    private(set) var ledges: [String: Ledge] = [:]
    private(set) var screen: CGSize = .zero
    private var last = Date()
    private var spawnClock: CGFloat = 0
    private var heavyRain = false
    private var rng = SystemRandomNumberGenerator()

    // 튜닝(pt) — 사진 앱 수준 절제
    private let maxDrops = 70
    private let slideR: CGFloat = 5.4           // 이 반지름 넘으면 흘러내림
    private let maxWater: CGFloat = 6           // 카드 윗면 물 최대 높이
    private let maxSnow: CGFloat = 9            // 카드 윗면 눈 최대 높이
    private let spillTilt: CGFloat = 0.28
    private let snowSlideTilt: CGFloat = 0.55

    // MARK: 카드 등록(카드가 화면에 있을 때 프레임을 알려 온다)

    func report(id: String, frame: CGRect) {
        if var l = ledges[id] {
            l.frame = frame; l.seen = Date(); ledges[id] = l
        } else {
            var l = Ledge(frame: frame); l.seen = Date()
            // 처음 보일 때부터 조금 고여(쌓여) 있게 — 빈 상태로 시작하면 밋밋하다
            for i in 0..<Self.cols { l.level[i] = mode == .rain ? 1.6 : 2.5 + .random(in: 0...1.5, using: &rng) }
            ledges[id] = l
        }
    }

    func level(of id: String) -> [CGFloat] { ledges[id]?.level ?? [] }

    // MARK: 한 프레임

    /// 번개 밝기(0…1) — 뇌우일 때만. 배경 위에 흰 막으로 깐다.
    private(set) var flash: Double = 0
    private var nextBolt: Date = .distantPast
    private var boltPulses: [Date] = []

    /// 바람(-1…1, 화면 가로). 흐르는 방울을 옆으로 비틀고 눈송이를 날린다.
    var wind: CGFloat = 0

    func step(now: Date, size: CGSize, gravity g: CGVector, mode newMode: Mode, heavy: Bool = false) {
        // 번개 — 6~14초마다, 0.08초 간격으로 두세 번 번쩍(진짜 번개는 한 번에 안 끝난다)
        if heavy {
            if now >= nextBolt {
                let k = Int.random(in: 2...3, using: &rng)
                boltPulses = (0..<k).map { now.addingTimeInterval(Double($0) * .random(in: 0.07...0.13, using: &rng)) }
                nextBolt = now.addingTimeInterval(.random(in: 6...14, using: &rng))
            }
            flash = boltPulses.map { p in let t = now.timeIntervalSince(p); return t < 0 ? 0 : max(0, 0.55 * exp(-t * 14)) }.max() ?? 0
        } else { flash = 0 }
        heavyRain = heavy
        if newMode != mode { mode = newMode; drops.removeAll(); flakes.removeAll(); ledges.removeAll() }
        screen = size
        #if DEBUG
        if Int(now.timeIntervalSince1970 * 2) % 6 == 0 && Int(last.timeIntervalSince1970 * 2) % 6 != 0 { AppLog.ui.info("rainworld.step drops=\(self.drops.count) ledges=\(self.ledges.count) size=\(Int(size.width))x\(Int(size.height))") }
        #endif
        let dt = CGFloat(min(now.timeIntervalSince(last), 1.0 / 20.0))
        last = now
        guard dt > 0, size.width > 0 else { return }
        // 화면에서 사라진 카드는 잊는다(스크롤로 나갔다 다시 오면 다시 쌓인다)
        ledges = ledges.filter { now.timeIntervalSince($0.value.seen) < 1.5 }
        if drops.isEmpty && mode == .rain { seedRain(size) }
        if flakes.isEmpty && mode == .snow { for _ in 0..<26 { flakes.append(newFlake(size, anywhere: true)) } }
        switch mode {
        case .rain: stepRain(dt, size, g)
        case .snow: stepSnow(dt, size, g)
        }
    }

    private func blocked(_ p: CGPoint) -> Bool { ledges.values.contains { $0.frame.insetBy(dx: -2, dy: -2).contains(p) } }

    private func seedRain(_ size: CGSize) {
        var n = 0
        while drops.count < 46 && n < 400 {
            n += 1
            let p = CGPoint(x: .random(in: 0...size.width, using: &rng), y: .random(in: 0...size.height, using: &rng))
            if blocked(p) { continue }
            drops.append(Drop(x: p.x, y: p.y, r: .random(in: 1.6...5.2, using: &rng)))
        }
    }

    // MARK: 비

    private func stepRain(_ dt: CGFloat, _ size: CGSize, _ g: CGVector) {
        // 1) 새 빗방울 — 카드 자리엔 안 생긴다(루버)
        spawnClock += dt * (heavyRain ? 16 : 9)
        while spawnClock >= 1 {
            spawnClock -= 1
            let p = CGPoint(x: .random(in: 0...size.width, using: &rng), y: .random(in: 0...size.height, using: &rng))
            if blocked(p) { continue }
            if drops.count < maxDrops {
                let r = CGFloat.random(in: 1.4...4.0, using: &rng)
                drops.append(Drop(x: p.x, y: p.y, r: r * 0.35, grow: r))
            } else if let i = drops.indices.filter({ !drops[$0].sliding }).randomElement(using: &rng) {
                drops[i].r = min(drops[i].r + 0.6, slideR * 1.3)
            }
        }
        let gLen = hypot(g.dx, g.dy)
        var born: [Drop] = []
        // 2) 이동
        for i in drops.indices {
            var d = drops[i]
            if d.grow > 0 { d.r = min(d.grow, d.r + dt * 30); if d.r >= d.grow { d.grow = 0 } }
            if d.r < 1.4 && !d.sliding { d.life += dt; if d.life > 3.5 { d.r -= dt * 0.5 } }   // 물자국 방울은 마른다
            d.sliding = d.r >= slideR && gLen > 0.15
            if d.sliding {
                let speed = (38 + 22 * (d.r - slideR)) * min(1, gLen)          // pt/초
                let tx = g.dx / max(gLen, 0.001), ty = g.dy / max(gLen, 0.001)
                let wob = CGFloat.random(in: -0.4...0.4, using: &rng)
                d.vx += ((tx + wob * ty * 0.35 + wind * 0.55) * speed - d.vx) * min(1, dt * 7)
                d.vy += ((ty - wob * tx * 0.35) * speed - d.vy) * min(1, dt * 7)
                d.x += d.vx * dt; d.y += d.vy * dt
                d.r -= dt * 0.35
                if CGFloat.random(in: 0...1, using: &rng) < dt * 20, born.count < 8 {
                    let v = max(0.001, hypot(d.vx, d.vy))
                    born.append(Drop(x: d.x - d.vx / v * d.r * 1.2, y: d.y - d.vy / v * d.r * 1.2, r: d.r * .random(in: 0.2...0.34, using: &rng)))
                }
            } else { d.vx = 0; d.vy = 0 }
            drops[i] = d
        }
        // 3) 합쳐짐 — 닿으면 큰 쪽이 삼킨다(면적 보존). 흐르는 방울은 길 위의 방울을 쓸어 담는다.
        for i in drops.indices where drops[i].r > 0 {
            for j in drops.indices where j > i && drops[j].r > 0 {
                let dx = drops[i].x - drops[j].x, dy = drops[i].y - drops[j].y
                let reach = (drops[i].sliding || drops[j].sliding) ? (drops[i].r + drops[j].r) * 0.95 : (drops[i].r + drops[j].r) * 0.8
                if dx * dx + dy * dy < reach * reach {
                    let (a, b) = drops[i].r >= drops[j].r ? (i, j) : (j, i)
                    drops[a].r = sqrt(drops[a].r * drops[a].r + drops[b].r * drops[b].r)
                    drops[a].grow = 0
                    drops[b].r = 0
                }
            }
        }
        // 4) 카드 윗면에 닿으면 고인 물로, 카드 안으로 들어가면(옆에서) 사라짐, 화면 밖이면 사라짐
        for i in drops.indices where drops[i].r > 0 {
            let d = drops[i]
            for (id, l) in ledges {
                let f = l.frame
                guard d.x > f.minX - 1, d.x < f.maxX + 1, d.y > f.minY - d.r - 2, d.y < f.maxY else { continue }
                if d.y < f.minY + 6 && d.vy >= 0 {
                    pour(into: id, x: d.x, volume: d.r * d.r * 0.55)
                }
                drops[i].r = 0
                break
            }
            if drops[i].x < -10 || drops[i].x > size.width + 10 || drops[i].y > size.height + 10 || drops[i].y < -10 { drops[i].r = 0 }
        }
        drops.removeAll { $0.r < 0.5 }
        drops.append(contentsOf: born.prefix(max(0, maxDrops + 10 - drops.count)))
        // 5) 카드 윗면 물 — 출렁이며 낮은 쪽으로, 넘치거나 기울면 모서리에서 흘러내림
        for id in Array(ledges.keys) { stepLedgeWater(id, dt, g) }
    }

    private func pour(into id: String, x: CGFloat, volume: CGFloat) {
        guard var l = ledges[id] else { return }
        let c = col(x, l.frame)
        for (o, w) in [(-1, 0.25), (0, 0.5), (1, 0.25)] as [(Int, CGFloat)] {
            let k = min(Self.cols - 1, max(0, c + o)); l.level[k] = min(maxWater * 1.4, l.level[k] + volume * w)
        }
        ledges[id] = l
    }

    private func col(_ x: CGFloat, _ f: CGRect) -> Int { min(Self.cols - 1, max(0, Int((x - f.minX) / f.width * CGFloat(Self.cols)))) }

    private func stepLedgeWater(_ id: String, _ dt: CGFloat, _ g: CGVector) {
        guard var l = ledges[id] else { return }
        let n = Self.cols
        let mean = l.level.reduce(0, +) / CGFloat(n)
        let slope = max(-1.8, min(1.8, g.dx / max(0.25, g.dy)))          // 수면 기울기(pt/pt)
        for i in 0..<n {
            let x = ((CGFloat(i) + 0.5) / CGFloat(n) - 0.5) * l.frame.width
            let target = max(0, mean + slope * x * 0.18)
            l.vel[i] += ((target - l.level[i]) * 55 - l.vel[i] * 8) * dt
        }
        for i in 0..<n { l.level[i] = max(0, l.level[i] + l.vel[i] * dt) }
        let nm = l.level.reduce(0, +) / CGFloat(n)
        if nm > 0.001 { for i in 0..<n { l.level[i] *= mean / nm } }
        // 쏟아짐 — 낮은 쪽 끝이 넘치거나 많이 기울면
        let left = g.dx < 0, e = left ? 0 : n - 1
        var spill: CGFloat = 0
        if l.level[e] > maxWater { spill += (l.level[e] - maxWater) * 0.7 }
        if abs(g.dx) > spillTilt { spill += l.level[e] * (abs(g.dx) - spillTilt) * dt * 6 }
        if spill > 0.01 {
            let take = min(spill, l.level[e] * 0.9); l.level[e] -= take
            // 모서리에서 방울이 떨어져 카드 옆면을 타고 흘러내린다(다시 유리 위 방울)
            if CGFloat.random(in: 0...1, using: &rng) < min(1, take * 1.6), drops.count < maxDrops + 10 {
                let x = left ? l.frame.minX - 3 : l.frame.maxX + 3
                drops.append(Drop(x: x, y: l.frame.minY + 2, r: .random(in: 4.8...6.0, using: &rng), vx: g.dx * 30, vy: 30, sliding: true))
            }
        }
        for i in 0..<n { l.level[i] = max(0, l.level[i] - dt * 0.05) }   // 아주 천천히 마른다
        ledges[id] = l
    }

    // MARK: 눈

    private func newFlake(_ size: CGSize, anywhere: Bool) -> Flake {
        Flake(x: .random(in: 0...size.width, using: &rng), y: anywhere ? .random(in: -20...size.height, using: &rng) : -10,
              r: .random(in: 1.2...3.2, using: &rng), phase: .random(in: 0...6.28, using: &rng), speed: .random(in: 26...52, using: &rng))
    }

    private func stepSnow(_ dt: CGFloat, _ size: CGSize, _ g: CGVector) {
        spawnClock += dt * 8
        while spawnClock >= 1 {
            spawnClock -= 1
            guard flakes.count < 60 else { continue }
            var f = newFlake(size, anywhere: false)
            if wind > 0.2 && Bool.random(using: &rng) { f.x = -8; f.y = .random(in: 0...size.height * 0.6, using: &rng) }        // 바람 부는 쪽 옆에서도 들어온다
            if wind < -0.2 && Bool.random(using: &rng) { f.x = size.width + 8; f.y = .random(in: 0...size.height * 0.6, using: &rng) }
            flakes.append(f)
        }
        let gLen = max(0.2, hypot(g.dx, g.dy))
        for i in flakes.indices {
            var f = flakes[i]
            f.phase += dt * 1.6
            f.x += (g.dx / gLen * f.speed * 0.6 + sin(f.phase) * 9 * (1 + abs(wind)) + wind * 90) * dt
            f.y += max(0.3, g.dy / gLen) * f.speed * dt
            // 카드 윗면에 내려앉음
            for (id, l) in ledges where f.x > l.frame.minX && f.x < l.frame.maxX && f.y > l.frame.minY - 2 && f.y < l.frame.minY + 8 {
                var ll = l; let c = col(f.x, l.frame)
                for (o, w) in [(-1, 0.35), (0, 0.6), (1, 0.35)] as [(Int, CGFloat)] {
                    let k = min(Self.cols - 1, max(0, c + o))
                    ll.level[k] = min(maxSnow, ll.level[k] + f.r * 0.22 * w * (1 - ll.level[k] / maxSnow * 0.7))
                }
                ledges[id] = ll; f.y = size.height + 50; break
            }
            if blocked(CGPoint(x: f.x, y: f.y)) { f.y = size.height + 50 }
            flakes[i] = f
        }
        flakes.removeAll { $0.y > size.height + 20 || $0.x < -20 || $0.x > size.width + 20 }
        // 쌓인 눈 — 안식각대로 무너지고, 많이 기울면 낮은 쪽으로 미끄러져 떨어진다
        for id in Array(ledges.keys) {
            guard var l = ledges[id] else { continue }
            let n = Self.cols
            for _ in 0..<2 { for i in 0..<(n - 1) {
                let d = l.level[i] - l.level[i + 1]
                if abs(d) > 1.2 { let m = (abs(d) - 1.2) * 0.5 * (d > 0 ? 1 : -1); l.level[i] -= m; l.level[i + 1] += m }
            } }
            let tilt = abs(g.dx)
            if tilt > snowSlideTilt {
                let rate = (tilt - snowSlideTilt) * dt * 1.5, dir = g.dx > 0 ? 1 : -1
                for i in (dir > 0 ? Array((0..<n).reversed()) : Array(0..<n)) {
                    let m = l.level[i] * rate; l.level[i] -= m
                    let j = i + dir; if j >= 0 && j < n { l.level[j] += m }
                }
            }
            ledges[id] = l
        }
    }
}
