import SwiftUI
import UIKit

/// 비 스프라이트 — 사진처럼 음영을 넣어 미리 렌더한 이미지(scripts/rain-sprites.py). 코드로 그린 선·점은 납작해 보였다(오너 "그래픽을 끌어올려").
enum RainSprites {
    static func load(_ n: String) -> Image {
        let ui = UIImage(contentsOfFile: Bundle.main.path(forResource: n, ofType: "png") ?? "") ?? UIImage()
        return Image(uiImage: ui)
    }
    static let streaks = (0..<5).map { load("streak\($0)") }
    static let drop = load("drop")
    static let dropFall = load("drop_fall")
    static let crown = (0..<6).map { load("crown\($0)") }
}

/// 홈 배경(색은 그대로) 위로 쏟아지는 빗줄기(바람·기울기만큼 비스듬히) 또는 내리는 눈송이. 카드 **뒤**에 깔리므로 카드 사진엔 물이 안 묻는다(루버). 뇌우면 가끔 번개(화면이 두어 번 번쩍).
/// 비 오는 날 배경만 살짝 어둡게(해가 가려진 빛) — 앨범·카드는 그대로. 홈 `.background` 에 깐다. 2초에 걸쳐 서서히.
struct WeatherDim: View {
    @State private var level: Double = 0
    var body: some View {
        let a = Ambient.shared
        let rainy = a.current == .rain || a.current == .storm
        TimelineView(.periodic(from: .now, by: 60)) { ctx in
            let night = a.phase(at: ctx.date) == "night"
            Color(red: 0.10, green: 0.13, blue: 0.19).opacity((night ? 0.42 : (a.current == .storm ? 0.32 : 0.24)) * level)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeInOut(duration: 2.0)) { level = rainy ? 1 : 0 } }
        .onChange(of: rainy) { _, now in withAnimation(.easeInOut(duration: 2.0)) { level = now ? 1 : 0 } }
    }
}

struct WeatherBackdrop: View {
    /// back = 카드 뒤(빗줄기·눈송이, 시뮬레이션을 돌린다) · front = 카드 앞(물보라·물결·매달린 물방울·번개)
    enum Layer { case back, front }
    var layer: Layer = .back
    @Environment(\.scenePhase) private var scenePhase
    /// 비·눈이 오는 정도(0…1) — 날씨가 바뀌면 2초에 걸쳐 서서히(그늘·빗줄기·눈 모두).
    @State private var level: Double = 0
    var body: some View {
        let a = Ambient.shared
        let w = a.current
        let wet = w == .rain || w == .snow || w == .storm
        ZStack {
            if wet || level > 0.001 {
                TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: scenePhase != .active || a.reduced)) { ctx in
                    GeometryReader { geo in
                        let world = RainWorld.shared
                        let _ = { world.wind = a.windPush }()
                        let _ = layer == .back ? world.step(now: ctx.date, size: geo.size, gravity: a.simGravity, mode: w == .snow ? .snow : .rain,
                                                            heavy: w == .storm) : ()
                        ZStack {
                            // 흐린 빛 — 비가 오면 해가 가려져 화면이 살짝 어두워진다(바탕색은 그대로, 그 위에 옅은 그늘). 밤엔 조금 더.
                            let frameT = ctx.date.timeIntervalSinceReferenceDate
                            Canvas { g, size in
                                _ = frameT
                                if layer == .back {
                                    if world.mode == .rain { drawStreaks(world, in: &g) } else { drawFlakes(world.flakes, in: &g) }
                                } else if world.mode == .rain { drawStreaks(world, in: &g, front: true); drawSplashes(world, in: &g) }
                            }
                            .opacity(level)
                            if w == .storm && layer == .front { Color.white.opacity(world.flash).allowsHitTesting(false) }
                        }
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onAppear { level = 0; withAnimation(.easeInOut(duration: 2.0)) { level = wet ? 1 : 0 }; if wet && layer == .back { a.beginMotion() } }
        .onChange(of: wet) { _, now in
            withAnimation(.easeInOut(duration: 2.0)) { level = now ? 1 : 0 }
            if layer == .back { if now { a.beginMotion() } else { a.endMotion() } }
        }
        .onDisappear { if wet && layer == .back { a.endMotion() } }
    }

    private func drawStreaks(_ w: RainWorld, in g: inout GraphicsContext, front: Bool = false) {
        let d = w.rainDir
        // 뒤 층: 액자 뒤로 떨어지는 비 + 액자 윗면에 맞을 비 · 앞 층: 액자 앞으로 떨어지는 비
        let mine = w.streaks.filter { front ? $0.plane == .front : $0.plane != .front }
        let imgs = RainSprites.streaks.map { g.resolve($0) }
        let angle = Angle.radians(atan2(d.dy, d.dx) - .pi / 2)
        func put(_ s: RainWorld.Streak, width: CGFloat, alpha: Double, in c: inout GraphicsContext) {
            var t = c
            t.translateBy(x: s.x, y: s.y)
            t.rotate(by: angle)
            t.opacity = alpha
            // 이미지 위 = 꼬리, 아래 = 머리(빗줄기 앞쪽이 진하다)
            let k = Int(abs(s.x * 7 + s.len)) % imgs.count
            t.draw(imgs[k], in: CGRect(x: -width / 2, y: -s.len, width: width, height: s.len))
        }
        g.drawLayer { far in
            for s in mine where !s.near { put(s, width: 2.2, alpha: 0.55 * s.alpha, in: &far) }
        }
        g.drawLayer { near in
            near.addFilter(.blur(radius: 0.3))
            for s in mine where s.near && !s.macro { put(s, width: 3.4, alpha: 0.85 * s.alpha, in: &near) }
        }
        g.drawLayer { macro in
            macro.addFilter(.blur(radius: 2.4))
            for s in mine where s.macro { put(s, width: 7, alpha: 0.35, in: &macro) }
        }
    }

    private func drawSplashes(_ w: RainWorld, in g: inout GraphicsContext) {
        let crown = RainSprites.crown.map { g.resolve($0) }
        let drop = g.resolve(RainSprites.drop), fall = g.resolve(RainSprites.dropFall)
        // 왕관 물보라 — 떨어진 자리에서 6프레임으로 피어나 사라진다(20pt 정사각)
        for r in w.rings {
            let f = min(5, Int(r.age / 0.22 * 6))
            g.draw(crown[f], in: CGRect(x: r.x - 10, y: r.y - 15.6, width: 20, height: 20))
        }
        // 튀는·떨어지는 물방울 — 진행 방향으로 늘어난 물방울 이미지
        for p in w.splashes {
            let v = max(1, hypot(p.vx, p.vy)), falling = p.life > 1
            let wdt: CGFloat = falling ? 3.6 : 2.0, h = wdt * min(2.4, 1 + v / (falling ? 120 : 90))
            var c = g
            c.translateBy(x: p.x, y: p.y)
            c.rotate(by: .radians(atan2(p.vy, p.vx) - .pi / 2))
            c.draw(fall, in: CGRect(x: -wdt / 2, y: -h / 2, width: wdt, height: h))
        }
        // 모서리에 매달린 물방울 — 가는 목 + 물방울 이미지(커질수록 아래로 늘어진다)
        for dr in w.drips.values where dr.r > 0.6 {
            var neck = Path()
            neck.move(to: CGPoint(x: dr.x - 0.45, y: dr.y - 1.2))
            neck.addLine(to: CGPoint(x: dr.x + 0.45, y: dr.y - 1.2))
            neck.addLine(to: CGPoint(x: dr.x + dr.r * 0.35, y: dr.y + dr.r * 0.4))
            neck.addLine(to: CGPoint(x: dr.x - dr.r * 0.35, y: dr.y + dr.r * 0.4))
            neck.closeSubpath()
            g.fill(neck, with: .color(Color(white: 0.9).opacity(0.55)))
            let sz = dr.r * 2.2
            g.draw(drop, in: CGRect(x: dr.x - sz / 2, y: dr.y + dr.r * 0.1, width: sz, height: sz * (1 + dr.r * 0.08)))
        }
    }

    private func drawFlakes(_ flakes: [RainWorld.Flake], in g: inout GraphicsContext) {
        for f in flakes {
            g.drawLayer { l in
                l.addFilter(.blur(radius: f.r * 0.3))
                l.fill(Path(ellipseIn: CGRect(x: f.x - f.r, y: f.y - f.r, width: f.r * 2, height: f.r * 2)),
                       with: .color(Color(red: 0.80, green: 0.85, blue: 0.93).opacity(0.9)))
            }
        }
    }
}

/// 카드 윗면 — 고인 물(투명한 물 띠 + 수면 반짝임) 또는 소복이 쌓인 눈. 카드 프레임을 RainWorld 에 알린다.
struct WeatherLedgeModifier: ViewModifier {
    let id: String
    @State private var level: Double = 0
    func body(content: Content) -> some View {
        let a = Ambient.shared
        let w = a.current
        let wet = w == .rain || w == .snow || w == .storm
        content
            .overlay(alignment: .top) {
                if wet || level > 0.001 {
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: a.reduced)) { ctx in
                        let frameT = ctx.date.timeIntervalSinceReferenceDate
                        GeometryReader { geo in
                            let _ = frameT
                            let f = geo.frame(in: .global)
                            let _ = DispatchQueue.main.async { RainWorld.shared.report(id: id, frame: f) }
                            // 둥근 모서리 위는 평평하지 않다 — 물·눈은 모서리 안쪽 평평한 구간에만 얹힌다
                            LedgeShape(levels: RainWorld.shared.level(of: id), snow: w == .snow)
                                .frame(width: max(0, geo.size.width - Radius.card * 2), height: 14)
                                .offset(x: Radius.card, y: -14 + 0.5)
                        }
                    }
                    .opacity(level)
                    .allowsHitTesting(false)
                }
            }
            .onAppear { withAnimation(.easeInOut(duration: 2.0)) { level = wet ? 1 : 0 } }
            .onChange(of: wet) { _, now in withAnimation(.easeInOut(duration: 2.0)) { level = now ? 1 : 0 } }
    }
}

private struct LedgeShape: View {
    let levels: [CGFloat]
    let snow: Bool
    var body: some View {
        Canvas { g, size in
            guard levels.count > 1 else { return }
            let n = levels.count
            var pts: [CGPoint] = []
            for i in 0..<n {
                let x = (CGFloat(i) + 0.5) / CGFloat(n) * size.width
                // 양끝은 표면장력으로 둥글게 꺼진다(네모난 끝 X)
                let taper = min(1, CGFloat(i) / 2.5, CGFloat(n - 1 - i) / 2.5)
                pts.append(CGPoint(x: x, y: size.height - levels[i] * taper))
            }
            var p = Path()
            p.move(to: CGPoint(x: 0, y: size.height))
            for i in 1..<n { p.addQuadCurve(to: CGPoint(x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2), control: pts[i - 1]) }
            p.addLine(to: CGPoint(x: size.width, y: size.height))
            p.closeSubpath()
            if snow {
                g.drawLayer { l in
                    l.addFilter(.shadow(color: .black.opacity(0.12), radius: 1.5, y: 0.5))
                    l.fill(p, with: .linearGradient(Gradient(colors: [.white, Color(red: 0.88, green: 0.91, blue: 0.97)]),
                                                    startPoint: CGPoint(x: 0, y: size.height - 9), endPoint: CGPoint(x: 0, y: size.height)))
                }
            } else {
                // 물 — 거의 투명한 띠, 수면에 가는 밝은 선, 아랫면은 카드 위라 살짝 어둡게
                // 물 — 위는 하늘빛 반사로 밝고, 아래(카드에 닿은 쪽)는 투명하게 어두운 테
                g.fill(p, with: .linearGradient(Gradient(stops: [.init(color: Color(red: 0.86, green: 0.92, blue: 0.98, opacity: 0.55), location: 0),
                                                                 .init(color: Color(red: 0.60, green: 0.70, blue: 0.82, opacity: 0.30), location: 0.55),
                                                                 .init(color: Color(red: 0.30, green: 0.38, blue: 0.48, opacity: 0.45), location: 1)]),
                                                startPoint: CGPoint(x: 0, y: size.height - 7), endPoint: CGPoint(x: 0, y: size.height)))
                // 반짝임 — 수면 높은 곳 몇 군데
                for i in stride(from: 2, to: n - 2, by: 5) where levels[i] > 1.2 {
                    let q = pts[i]
                    g.fill(Path(ellipseIn: CGRect(x: q.x - 1.4, y: q.y + 0.6, width: 2.8, height: 0.9)), with: .color(.white.opacity(0.9)))
                }
                var surf = Path(); surf.move(to: pts[0])
                for i in 1..<n { surf.addQuadCurve(to: CGPoint(x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2), control: pts[i - 1]) }
                g.stroke(surf, with: .color(.white.opacity(0.9)), lineWidth: 0.8)
            }
        }
    }
}

extension View {
    func weatherLedge(id: String) -> some View { modifier(WeatherLedgeModifier(id: id)) }
}

/// 맑은 날 광원 그림자 — 해 위치(실제 일출·일몰)에 따라 방향·길이가 바뀐다. 1분마다 갱신.
struct SunShadowModifier: ViewModifier {
    func body(content: Content) -> some View {
        TimelineView(.periodic(from: .now, by: 60)) { ctx in
            let l = Ambient.shared.light(at: ctx.date)
            content
                .shadow(color: Color(red: 0.25, green: 0.18, blue: 0.10).opacity(l.opacity * (0.6 + 0.4 * l.warm)),
                        radius: l.radius, x: l.dx, y: l.dy)
        }
    }
}

extension View {
    func sunShadow() -> some View { modifier(SunShadowModifier()) }
}
