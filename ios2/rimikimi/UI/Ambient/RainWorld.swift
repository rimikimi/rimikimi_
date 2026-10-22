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
    struct Flake { var x, y, r, phase, speed: CGFloat; var plane: Plane = .back; var bokeh = false; var kind = 0 }
    /// 기울여서 미끄러져 떨어지는 눈 덩어리
    struct Clump { var x, y, vx, vy, r: CGFloat }
    private(set) var snowClumps: [Clump] = []
    /// 액자 앞면에 내려앉아 녹는 눈송이(카드 기준 좌표) — 4초쯤 지나면 작은 물방울이 된다
    struct Melt { var id: String; var rx, ry, r, age: CGFloat }
    private(set) var melts: [Melt] = []
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
    private let maxSnow: CGFloat = 15            // 카드 윗면 눈 최대 높이
    private let spillTilt: CGFloat = 0.28
    private let snowSlideTilt: CGFloat = 0.55

    // MARK: 카드 등록(카드가 화면에 있을 때 프레임을 알려 온다)

    func report(id: String, frame: CGRect) {
        if var l = ledges[id] {
            l.frame = frame; l.seen = Date(); ledges[id] = l
        } else {
            var l = Ledge(frame: frame); l.seen = Date()
            // 처음 보일 때부터 조금 고여(쌓여) 있게 — 빈 상태로 시작하면 밋밋하다
            for i in 0..<Self.cols { l.level[i] = mode == .rain ? .random(in: 0.3...1.2, using: &rng) : 5 + .random(in: 0...2.5, using: &rng) }
            ledges[id] = l
        }
    }

    func level(of id: String) -> [CGFloat] { ledges[id]?.level ?? [] }
    func ledgeFrame(_ id: String) -> CGRect? { ledges[id]?.frame }
    /// 셰이더용 — 그 카드의 물방울 [x,y,r,dirx,diry,stretch] (카드 좌표 pt)
    func faceDropFloats(_ id: String) -> [Float] {
        var out: [Float] = []
        for d in faceDrops where d.id == id {
            let v = hypot(d.vx, d.vy)
            let dx = v > 0.5 ? d.vx / v : 0, dy = v > 0.5 ? d.vy / v : 1
            let st: CGFloat = d.sliding ? min(3.0, 1.6 + v / 40) : 1
            out += [Float(d.rx), Float(d.ry), Float(d.r), Float(dx), Float(dy), Float(st)]
        }
        return out
    }
    /// 셰이더용 — 물길 점 [x,y,w,a]
    func trailFloats(_ id: String) -> [Float] {
        var out: [Float] = []
        func add(_ pts: [CGPoint], _ w: CGFloat, _ fade: CGFloat) {
            if !out.isEmpty { out += [0, 0, 0, 0] }    // 물길 경계
            for (i, p) in pts.enumerated() {
                let a = fade * (0.35 + 0.65 * CGFloat(i) / CGFloat(max(1, pts.count - 1)))
                out += [Float(p.x), Float(p.y), Float(w), Float(a)]
            }
        }
        for d in faceDrops where d.id == id && d.trail.count > 1 { add(d.trail, max(1.0, d.r * 0.8), 1) }
        for w in wets where w.id == id { add(w.pts, w.w, max(0, 1 - w.age / 5)) }
        return Array(out.suffix(4 * 160))
    }

    // MARK: 한 프레임

    /// 번개 밝기(0…1) — 뇌우일 때만. 배경 위에 흰 막으로 깐다.
    private(set) var flash: Double = 0
    private var nextBolt: Date = .distantPast
    /// dev — 번개 간격 고정(녹화 확인용). nil 이면 20~40초.
    var devBoltEvery: Double?
    /// 번개 줄기 — 굵은 본줄기 + 갈라지는 가지(각 줄 = 점 목록, 굵기). 칠 때마다 새로 만든다.
    struct Bolt { var pts: [CGPoint]; var width: CGFloat }
    private(set) var bolts: [Bolt] = []

    private func makeBolt(_ size: CGSize) {
        var out: [Bolt] = []
        // 화면 위쪽 바깥에서 시작해 아래로 지그재그(중점 변위), 가지는 본줄기 중간에서 비스듬히 갈라진다
        func path(from a: CGPoint, to b: CGPoint, rough: CGFloat, depth: Int) -> [CGPoint] {
            var pts = [a, b]
            var disp = rough
            for _ in 0..<depth {
                var next: [CGPoint] = [pts[0]]
                for k in 1..<pts.count {
                    let p0 = pts[k - 1], p1 = pts[k]
                    let mid = CGPoint(x: (p0.x + p1.x) / 2 + .random(in: -disp...disp, using: &rng), y: (p0.y + p1.y) / 2 + .random(in: -disp * 0.3...disp * 0.3, using: &rng))
                    next.append(mid); next.append(p1)
                }
                pts = next; disp *= 0.55
            }
            return pts
        }
        let x0 = CGFloat.random(in: size.width * 0.15...size.width * 0.85, using: &rng)
        let end = CGPoint(x: x0 + .random(in: -size.width * 0.3...size.width * 0.3, using: &rng), y: size.height * .random(in: 0.55...0.9, using: &rng))
        let main = path(from: CGPoint(x: x0, y: -20), to: end, rough: 90, depth: 7)
        out.append(Bolt(pts: main, width: 2.4))
        for _ in 0..<Int.random(in: 3...6, using: &rng) {
            let k = Int.random(in: main.count / 6 ..< main.count * 4 / 5, using: &rng)
            let a = main[k]
            let b = CGPoint(x: a.x + .random(in: -160...160, using: &rng), y: a.y + .random(in: 60...220, using: &rng))
            let br = path(from: a, to: b, rough: 40, depth: 5)
            out.append(Bolt(pts: br, width: 1.1))
            if Bool.random(using: &rng) {   // 가지의 가지
                let a2 = br[br.count / 2]
                out.append(Bolt(pts: path(from: a2, to: CGPoint(x: a2.x + .random(in: -80...80, using: &rng), y: a2.y + .random(in: 30...110, using: &rng)), rough: 18, depth: 4), width: 0.6))
            }
        }
        bolts = out
    }
    private var boltPulses: [Date] = []

    /// 바람(-1…1, 화면 가로). 흐르는 방울을 옆으로 비틀고 눈송이를 날린다.
    var wind: CGFloat = 0

    func step(now: Date, size: CGSize, gravity g: CGVector, mode newMode: Mode, heavy: Bool = false) {
        // 번개 — 6~14초마다, 0.08초 간격으로 두세 번 번쩍(진짜 번개는 한 번에 안 끝난다)
        if heavy {
            if now >= nextBolt {
                let k = Int.random(in: 1...2, using: &rng)
                boltPulses = (0..<k).map { now.addingTimeInterval(Double($0) * .random(in: 0.07...0.13, using: &rng)) }
                if screen.width > 0 { makeBolt(screen) }
                nextBolt = now.addingTimeInterval(devBoltEvery ?? .random(in: 18...40, using: &rng))   // 자주 치면 버그 같다(오너) — 20~40초에 한 번
            }
            flash = boltPulses.map { p in let t = now.timeIntervalSince(p); return t < 0 ? 0 : max(0, exp(-t * 11)) }.max() ?? 0
        } else { flash = 0 }
        heavyRain = heavy
        if newMode != mode { mode = newMode; drops.removeAll(); flakes.removeAll(); ledges.removeAll(); streaks.removeAll(); splashes.removeAll(); rings.removeAll(); drips.removeAll(); faceDrops.removeAll(); wets.removeAll(); hangs.removeAll(); snowClumps.removeAll(); melts.removeAll() }
        screen = size
        #if DEBUG
        if Int(now.timeIntervalSince1970 * 2) % 6 == 0 && Int(last.timeIntervalSince1970 * 2) % 6 != 0 { AppLog.ui.info("rainworld.step drops=\(self.drops.count) ledges=\(self.ledges.count) size=\(Int(size.width))x\(Int(size.height))") }
        #endif
        let dt = CGFloat(min(now.timeIntervalSince(last), 1.0 / 20.0))
        // 빗줄기 길이가 한 프레임 이동 거리보다 짧으면 끊겨 보인다 — 최소 길이 보장은 그리기 쪽 len 로 처리
        last = now
        guard dt > 0, size.width > 0 else { return }
        // 화면에서 사라진 카드는 잊는다(스크롤로 나갔다 다시 오면 다시 쌓인다)
        ledges = ledges.filter { now.timeIntervalSince($0.value.seen) < 1.5 }
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

    // MARK: 비 — 빗줄기(배경으로 쏟아짐, 카드 뒤) · 카드 윗면에 닿으면 튀고 고임

    /// 바깥에 걸린 액자에 내리는 비(오너 2026-10-22): 50% 액자 뒤 · 30% 액자 윗면에 맞음 · 20% 액자 앞.
    enum Plane { case back, hit, front }
    struct Streak { var x, y, len, speed: CGFloat; var near: Bool; var hit = false; var alpha: CGFloat = 1; var lastHitY: CGFloat = -9999; var macro = false; var plane: Plane = .back }
    struct Splash { var x, y, vx, vy, life: CGFloat; var size: CGFloat = 0 }
    struct Ring { var x, y, age: CGFloat }
    /// 액자 앞면에 묻은 물방울(카드 기준 좌표 rx, ry — 스크롤해도 카드에 붙어 다닌다).
    /// 작으면 붙어 있고, 커지면(합쳐지면) 중력 방향으로 흘러내리며 작은 물자국을 남기고, 아랫변에 모여 맺혔다가 떨어진다.
    struct FaceDrop { var id: String; var rx, ry, r: CGFloat; var vx: CGFloat = 0; var vy: CGFloat = 0; var sliding = false; var age: CGFloat = 0; var trail: [CGPoint] = [] }
    private(set) var faceDrops: [FaceDrop] = []
    /// 흐른 뒤 남은 물길(서서히 마른다)
    struct Wet { var id: String; var pts: [CGPoint]; var age: CGFloat; var w: CGFloat }
    private(set) var wets: [Wet] = []
    /// 아랫변에 맺힌 물방울(카드별 여러 개) — 커지다가 떨어진다.
    struct Hang { var rx, r: CGFloat; var limit: CGFloat = 2.8; var wobble: CGFloat = 0 }
    private(set) var hangs: [String: [Hang]] = [:]
    private(set) var rings: [Ring] = []
    /// 모서리에 매달린 물방울(카드별) — 커지다가 목이 가늘어지며 떨어진다.
    struct Drip { var x, y, r: CGFloat; var left: Bool }
    private(set) var drips: [String: Drip] = [:]
    private(set) var streaks: [Streak] = []
    private(set) var splashes: [Splash] = []
    /// 빗줄기 방향(단위 벡터) — 아래로 + 바람·기울기만큼 비스듬히. 그리기에서도 쓴다.
    private(set) var rainDir = CGVector(dx: 0, dy: 1)

    private func stepRain(_ dt: CGFloat, _ size: CGSize, _ g: CGVector) {
        // 방향: 화면 중력(기울기) + 바람. 빗줄기는 거의 수직이라 기울기 영향은 절반만.
        let gx = g.dx * 0.5 + wind * 0.45 + 0.12   // 기본으로 살짝 사선(레퍼런스처럼)
        let gy = max(0.5, abs(g.dy) + 0.3)
        let L = hypot(gx, gy); rainDir = CGVector(dx: gx / L, dy: gy / L)
        // 1) 새 빗줄기 — 먼 층(가늘고 느림)·가까운 층(굵고 길고 빠름) 두 겹(넷플릭스 웬즈데이 레퍼런스: 촘촘하고 긴 사선)
        spawnClock += dt * (heavyRain ? 420 : 260)
        while spawnClock >= 1 {
            spawnClock -= 1
            guard streaks.count < (heavyRain ? 340 : 220) else { continue }
            let roll = CGFloat.random(in: 0...1, using: &rng)
            let near = roll < 0.35
            let macro = roll > 0.985          // 아주 가까운(초점 나간) 굵고 흐린 빗줄기 — 깊이감
            // 비스듬하면 바람 불어오는 쪽 옆면에서도 들어온다 — 위쪽만에서 내리면 아래 반대편이 빈다
            var x = CGFloat.random(in: 0...size.width, using: &rng), y = CGFloat.random(in: -120 ... -10, using: &rng)
            let sideShare = min(0.6, abs(rainDir.dx) / max(0.3, rainDir.dy) * size.height / (size.width + size.height))
            if CGFloat.random(in: 0...1, using: &rng) < sideShare {
                x = rainDir.dx > 0 ? -10 : size.width + 10
                y = .random(in: -20...size.height, using: &rng)
            }
            streaks.append(Streak(x: x, y: y,
                                  len: near ? .random(in: 55...95, using: &rng) : .random(in: 28...50, using: &rng),
                                  speed: near ? .random(in: 1700...2100, using: &rng) : .random(in: 1150...1450, using: &rng),
                                  near: near || macro, alpha: .random(in: 0.75...1.15, using: &rng), macro: macro))
            let pr = CGFloat.random(in: 0...1, using: &rng)
            streaks[streaks.count - 1].plane = macro ? .front : (pr < 0.5 ? .back : pr < 0.8 ? .hit : .front)
            if macro { streaks[streaks.count - 1].len = .random(in: 130...190, using: &rng); streaks[streaks.count - 1].speed = 2400 }
        }
        // 2) 이동 · 카드 윗면 충돌(튀고 고임) · 화면 밖 제거
        for i in streaks.indices {
            streaks[i].x += rainDir.dx * streaks[i].speed * dt
            streaks[i].y += rainDir.dy * streaks[i].speed * dt
            let p = CGPoint(x: streaks[i].x, y: streaks[i].y)
            // 카드 윗변을 막 지난 가까운 빗줄기 일부만 윗면에 떨어져 튀고 고인다 — 나머지 비는 카드 앞을 그대로 지나간다(레퍼런스처럼)
            // 액자 윗면에 맞는 20% 만 — 처음 만나는 액자 윗면에서 멈추고 튀고 고인다. 뒤·앞으로 떨어지는 비는 그냥 지나간다.
            if streaks[i].plane == .hit {
                for (id, l) in ledges where p.x > l.frame.minX && p.x < l.frame.maxX && p.y > l.frame.minY && p.y < l.frame.minY + streaks[i].speed * dt + 2 && abs(streaks[i].lastHitY - l.frame.minY) > 1 {
                    streaks[i].lastHitY = l.frame.minY
                                        pour(into: id, x: p.x, volume: streaks[i].near ? 0.22 : 0.12)
                    // 일부는 튀면서 액자 앞면 윗부분에 묻는다
                    if faceDrops.count < 90, CGFloat.random(in: 0...1, using: &rng) < 0.45 {
                        let n = Int.random(in: 1...2, using: &rng)
                        for _ in 0..<n {
                            let r = CGFloat.random(in: 0.8...2.2, using: &rng)
                            let (x, y, _) = Self.insideRounded(x: p.x - l.frame.minX + .random(in: -8...8, using: &rng), y: .random(in: 3...22, using: &rng),
                                                               w: l.frame.width, h: l.frame.height, R: Radius.card, margin: r * 1.1)
                            faceDrops.append(FaceDrop(id: id, rx: x, ry: y, r: r))
                        }
                    }
                    // 왕관 물보라 — 떨어진 자리에서 사방으로 비스듬히 튀는 작은 물방울 + 납작한 물결 고리
                    if rings.count < 40 { rings.append(Ring(x: p.x, y: l.frame.minY - (level(of: id).max() ?? 0) * 0.5, age: 0)) }
                    if splashes.count < 160 {
                        let k = Int.random(in: 2...4, using: &rng)
                        for j in 0..<k {
                            let ang = CGFloat.pi * (0.15 + 0.7 * (CGFloat(j) + .random(in: 0...0.8, using: &rng)) / CGFloat(k))
                            let sp = CGFloat.random(in: 45...95, using: &rng)
                            splashes.append(Splash(x: p.x, y: l.frame.minY - 1, vx: cos(ang) * sp, vy: -sin(ang) * sp,
                                                   life: .random(in: 0.14...0.26, using: &rng)))
                        }
                    }
                    streaks[i].y = size.height + 999   // 액자에 맞은 빗줄기는 끝
                    break
                }
            }
        }
        streaks.removeAll { $0.y - $0.len > size.height || $0.x < -150 || $0.x > size.width + 150 }
        // 3) 튀는 물방울 · 카드 모서리에서 떨어지는 물방울 — 중력으로 낙하
        for i in splashes.indices {
            splashes[i].vy += 900 * dt
            splashes[i].vx += wind * 120 * dt
            splashes[i].x += splashes[i].vx * dt; splashes[i].y += splashes[i].vy * dt
            splashes[i].life -= dt
        }
        splashes.removeAll { $0.life <= 0 || $0.y > size.height }
        stepFaceDrops(dt, g)
        for i in rings.indices { rings[i].age += dt }
        rings.removeAll { $0.age > 0.22 }
        drips = drips.filter { ledges[$0.key] != nil }
        // 4) 카드 윗면 물 — 출렁이며 낮은 쪽으로, 넘치거나 기울면 모서리로 쪼르르
        for id in Array(ledges.keys) { stepLedgeWater(id, dt, g) }
    }

    /// 둥근 사각형(w×h, 모서리 R) 안쪽 margin 만큼 들어온 영역으로 점을 밀어 넣는다. 밀었으면 onEdge = true.
    nonisolated static func insideRounded(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, R: CGFloat, margin m: CGFloat) -> (CGFloat, CGFloat, Bool) {
        var px = min(max(x, m), w - m), py = min(max(y, m), h - m)
        var edge = px != x || py != y
        let rr = max(0.1, R - m)
        for (cx, cy) in [(R, R), (w - R, R), (R, h - R), (w - R, h - R)] {
            let inX = cx == R ? px < R : px > w - R
            let inY = cy == R ? py < R : py > h - R
            if inX && inY {
                let dx = px - cx, dy = py - cy, dl = hypot(dx, dy)
                if dl > rr { px = cx + dx / dl * rr; py = cy + dy / dl * rr; edge = true }
            }
        }
        return (px, py, edge)
    }

    private func stepFaceDrops(_ dt: CGFloat, _ g: CGVector) {
        let gLen = hypot(g.dx, g.dy)
        let slideR: CGFloat = 1.8
        var born: [FaceDrop] = []
        for i in faceDrops.indices {
            var d = faceDrops[i]
            guard let l = ledges[d.id] else { d.r = 0; faceDrops[i] = d; continue }
            d.age += dt
            // 김 서린 듯 아주 천천히 커진다(맺힌 물이 모임) — 결국 흘러내린다
            if !d.sliding { d.r += dt * 0.05 }
            d.sliding = d.r >= slideR && gLen > 0.2
            if d.sliding {
                let speed = (26 + 30 * (d.r - slideR)) * min(1, gLen)
                let tx = g.dx / max(gLen, 0.001), ty = g.dy / max(gLen, 0.001)
                // 유리 위 물줄기는 곧지 않다 — 미세한 얼룩에 걸려 멈칫하고 옆으로 꺾인다
                let snag: CGFloat = CGFloat.random(in: 0...1, using: &rng) < dt * 1.5 ? 0.15 : 1
                let wob = sin(d.age * 3.1 + d.rx * 0.7) * 0.35 + CGFloat.random(in: -0.15...0.15, using: &rng)
                d.vx += ((tx + wob * ty) * speed * snag - d.vx) * min(1, dt * 6)
                d.vy += (ty * speed * snag - d.vy) * min(1, dt * 6)
                d.rx += d.vx * dt; d.ry += d.vy * dt
                d.r -= dt * 0.25                                    // 지나간 자리에 물을 남긴다
                // 물길 — 지나간 자리(2pt 마다) 기록, 최근 24점
                if let last = d.trail.last { if hypot(d.rx - last.x, d.ry - last.y) >= 2 { d.trail.append(CGPoint(x: d.rx, y: d.ry)) } } else { d.trail.append(CGPoint(x: d.rx, y: d.ry)) }
                if d.trail.count > 24 { d.trail.removeFirst(d.trail.count - 24) }
                // 물길 위에 남는 작은 방울(살아남을 크기로)
                if CGFloat.random(in: 0...1, using: &rng) < dt * 3.5, born.count < 3 {
                    born.append(FaceDrop(id: d.id, rx: d.rx - d.vx * 0.05, ry: d.ry - d.vy * 0.05, r: max(0.55, d.r * .random(in: 0.3...0.45, using: &rng))))
                }
            } else {
                d.vx = 0; d.vy = 0
                if d.r < 1.0 && d.age > 6 { d.r -= dt * 0.08 }      // 작은 물자국은 마른다
            }
            // 가장자리 — 액자는 둥근 모서리다. 물은 넘어가지 않고 테두리(직선·곡선)를 따라 흐른다.
            //   아래 모서리에선 곡선을 타고 안쪽으로 굴러 들어와 평평한 아랫변에 맺힌다.
            let m = d.r * 1.1
            let (px, py, onEdge) = Self.insideRounded(x: d.rx, y: d.ry, w: l.frame.width, h: l.frame.height, R: Radius.card, margin: m)
            if onEdge {
                // 테두리에 막힌 성분은 없애고 테두리를 따라 미끄러지게(접선 방향만 남김)
                let nx = d.rx - px, ny = d.ry - py, nl = max(0.001, hypot(nx, ny))
                let ux = nx / nl, uy = ny / nl
                let into = d.vx * ux + d.vy * uy
                if into > 0 { d.vx -= into * ux; d.vy -= into * uy }
                d.rx = px; d.ry = py
            }
            // 아랫변(평평한 구간) — 그 자리에 맺힌다
            if d.ry >= l.frame.height - m - 0.6 && d.rx >= Radius.card * 0.9 && d.rx <= l.frame.width - Radius.card * 0.9 {
                var list = hangs[d.id] ?? []
                if let k = list.firstIndex(where: { abs($0.rx - d.rx) < 4 }) { list[k].r = sqrt(list[k].r * list[k].r + d.r * d.r) }
                else { list.append(Hang(rx: min(l.frame.width - Radius.card, max(Radius.card, d.rx)), r: d.r * 0.8, limit: .random(in: 2.2...3.6, using: &rng))) }
                hangs[d.id] = list
                d.r = 0
            }
            faceDrops[i] = d
        }
        // 합쳐짐 — 흐르는 방울이 길 위 방울을 삼킨다
        for i in faceDrops.indices where faceDrops[i].sliding && faceDrops[i].r > 0 {
            for j in faceDrops.indices where j != i && faceDrops[j].r > 0 && faceDrops[j].id == faceDrops[i].id && !faceDrops[j].sliding {
                let dx = faceDrops[i].rx - faceDrops[j].rx, dy = faceDrops[i].ry - faceDrops[j].ry
                let reach = faceDrops[i].r + faceDrops[j].r
                if dx * dx + dy * dy < reach * reach {
                    faceDrops[i].r = sqrt(faceDrops[i].r * faceDrops[i].r + faceDrops[j].r * faceDrops[j].r)
                    faceDrops[j].r = 0
                }
            }
        }
        for d in faceDrops where d.r < 0.3 && d.trail.count > 2 { wets.append(Wet(id: d.id, pts: d.trail, age: 0, w: 1.6)) }
        for d in faceDrops where d.ry >= (ledges[d.id]?.frame.height ?? 0) - 1.5 && d.trail.count > 2 { wets.append(Wet(id: d.id, pts: d.trail, age: 0, w: 1.6)) }
        faceDrops.removeAll { $0.r < 0.3 }
        for i in wets.indices { wets[i].age += dt }
        wets.removeAll { $0.age > 5 || ledges[$0.id] == nil }
        if wets.count > 40 { wets.removeFirst(wets.count - 40) }
        faceDrops.append(contentsOf: born.prefix(max(0, 120 - faceDrops.count)))
        // 아랫변에 맺힌 물방울 — 커지면 떨어진다(떨어진 방울은 배경으로 낙하)
        for (id, list) in hangs {
            guard let l = ledges[id] else { hangs[id] = nil; continue }
            var keep: [Hang] = []
            for var h in list {
                h.r += dt * 0.03
                h.wobble += dt
                // 기울이면 아랫변을 따라 낮은 쪽으로 기어간다
                h.rx = min(l.frame.width - Radius.card, max(Radius.card, h.rx + g.dx * dt * 8))   // 둥근 모서리 시작점까지만
                if h.r > h.limit {
                    // 목이 끊기며 떨어진다 — 큰 방울 + 가끔 뒤따르는 작은 방울(위성 방울)
                    let x = l.frame.minX + h.rx, y = l.frame.maxY + h.r
                    splashes.append(Splash(x: x, y: y, vx: g.dx * 12, vy: .random(in: 20...45, using: &rng), life: 1.4, size: h.r * 1.35))
                    if Bool.random(using: &rng) { splashes.append(Splash(x: x, y: y - h.r * 0.9, vx: g.dx * 12, vy: 10, life: 1.3, size: h.r * 0.45)) }
                    h.r = .random(in: 0.3...0.8, using: &rng)
                    h.limit = .random(in: 2.2...3.6, using: &rng)
                    h.wobble = 0
                }
                keep.append(h)
            }
            // 가까이 붙은 맺힘끼리는 합쳐진다
            var merged: [Hang] = []
            for h in keep.sorted(by: { $0.rx < $1.rx }) {
                if var last = merged.last, abs(last.rx - h.rx) < last.r + h.r {
                    last.r = sqrt(last.r * last.r + h.r * h.r); last.rx = (last.rx + h.rx) / 2; merged[merged.count - 1] = last
                } else { merged.append(h) }
            }
            hangs[id] = merged
        }
    }

    private func pour(into id: String, x: CGFloat, volume: CGFloat) {
        guard var l = ledges[id] else { return }
        let c = col(x, l.frame)
        for (o, w) in [(-1, 0.25), (0, 0.5), (1, 0.25)] as [(Int, CGFloat)] {
            let k = min(Self.cols - 1, max(0, c + o)); l.level[k] = min(maxWater * 1.4, l.level[k] + volume * w)
        }
        // 떨어진 자리 수면이 꺼졌다가 잔물결로 번진다
        if mode == .rain { l.vel[c] -= 6 * volume / 0.16 }
        ledges[id] = l
    }

    private func col(_ x: CGFloat, _ f: CGRect) -> Int {
        let r = Radius.card, w = max(1, f.width - r * 2)
        return min(Self.cols - 1, max(0, Int((x - f.minX - r) / w * CGFloat(Self.cols))))
    }

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
            // 넘친 물은 둥근 모서리를 넘어 액자 옆면을 타고 흘러내린다(크기·간격 제각각) — 아랫모서리에 모였다가 떨어진다
            if faceDrops.count < 130, CGFloat.random(in: 0...1, using: &rng) < min(1, take * 2.6) {
                // 윗모서리 곡선 위 한 점에서 시작해 곡선을 타고 옆면으로 내려간다
                let r = CGFloat.random(in: 0.9...2.1, using: &rng)
                let ang = CGFloat.random(in: 0.15...0.6, using: &rng) * .pi / 2          // 곡선 위쪽 부분
                let R = Radius.card, mm = r * 1.1
                let rx = left ? R - (R - mm) * cos(ang) : l.frame.width - R + (R - mm) * cos(ang)
                let ry = R - (R - mm) * sin(ang)
                faceDrops.append(FaceDrop(id: id, rx: rx, ry: ry, r: r, vx: left ? -6 : 6, vy: 8, sliding: true))
            }
        }
        for i in 0..<n { l.level[i] = max(0, l.level[i] - dt * 0.05) }   // 아주 천천히 마른다
        ledges[id] = l
    }

    // MARK: 눈

    private func newFlake(_ size: CGSize, anywhere: Bool) -> Flake {
        let pr = CGFloat.random(in: 0...1, using: &rng)
        let bokeh = pr > 0.94                               // 아주 가까운(초점 나간) 큰 눈송이
        let plane: Plane = bokeh ? .front : (pr < 0.5 ? .back : pr < 0.8 ? .hit : .front)
        let far = plane == .back
        return Flake(x: .random(in: 0...size.width, using: &rng), y: anywhere ? .random(in: -20...size.height, using: &rng) : -10,
                     r: bokeh ? .random(in: 7...11, using: &rng) : far ? .random(in: 1.3...2.4, using: &rng) : .random(in: 2.2...3.8, using: &rng),
                     phase: .random(in: 0...6.28, using: &rng),
                     speed: bokeh ? .random(in: 70...95, using: &rng) : far ? .random(in: 22...38, using: &rng) : .random(in: 36...58, using: &rng),
                     plane: plane, bokeh: bokeh, kind: Int.random(in: 0...3, using: &rng))
    }

    private func stepSnow(_ dt: CGFloat, _ size: CGSize, _ g: CGVector) {
        spawnClock += dt * 16
        while spawnClock >= 1 {
            spawnClock -= 1
            guard flakes.count < 110 else { continue }
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
            // 앞으로 지나가는 눈송이 일부는 액자 앞면에 내려앉아 녹는다
            if f.plane == .front && !f.bokeh && melts.count < 40, CGFloat.random(in: 0...1, using: &rng) < dt * 0.25 {
                for (id, l) in ledges where l.frame.contains(CGPoint(x: f.x, y: f.y)) {
                    melts.append(Melt(id: id, rx: f.x - l.frame.minX, ry: f.y - l.frame.minY, r: f.r, age: 0)); f.y = size.height + 50; break
                }
            }
            // 액자 윗면에 내려앉음 — 윗면에 맞는 눈(30%)만
            for (id, l) in ledges where f.plane == .hit && f.x > l.frame.minX + Radius.card && f.x < l.frame.maxX - Radius.card && f.y > l.frame.minY - 2 && f.y < l.frame.minY + 8 {
                var ll = l; let c = col(f.x, l.frame)
                for (o, w) in [(-1, 0.35), (0, 0.6), (1, 0.35)] as [(Int, CGFloat)] {
                    let k = min(Self.cols - 1, max(0, c + o))
                    ll.level[k] = min(maxSnow, ll.level[k] + f.r * 0.35 * w * (1 - ll.level[k] / maxSnow * 0.7))
                }
                ledges[id] = ll; f.y = size.height + 50; break
            }
            flakes[i] = f
        }
        flakes.removeAll { $0.y > size.height + 20 || $0.x < -20 || $0.x > size.width + 20 }
        for i in snowClumps.indices { snowClumps[i].vy += 700 * dt; snowClumps[i].vx += wind * 60 * dt; snowClumps[i].x += snowClumps[i].vx * dt; snowClumps[i].y += snowClumps[i].vy * dt }
        snowClumps.removeAll { $0.y > size.height + 10 }
        for i in melts.indices { melts[i].age += dt }
        melts.removeAll { $0.age > 7 || ledges[$0.id] == nil }
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
                    else if m > 0.02, snowClumps.count < 40, CGFloat.random(in: 0...1, using: &rng) < m * 6 {
                        // 끝에서 넘친 눈은 덩어리로 떨어진다
                        let x = dir > 0 ? l.frame.maxX - Radius.card * 0.4 : l.frame.minX + Radius.card * 0.4
                        snowClumps.append(Clump(x: x, y: l.frame.minY, vx: CGFloat(dir) * .random(in: 10...30, using: &rng), vy: 0, r: .random(in: 1.6...3.4, using: &rng)))
                    }
                }
            }
            ledges[id] = l
        }
    }
}
