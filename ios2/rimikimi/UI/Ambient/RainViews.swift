import SwiftUI

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
                        let _ = world.step(now: ctx.date, size: geo.size, gravity: a.simGravity, mode: w == .snow ? .snow : .rain,
                                           heavy: w == .storm)
                        ZStack {
                            // 흐린 빛 — 비가 오면 해가 가려져 화면이 살짝 어두워진다(바탕색은 그대로, 그 위에 옅은 그늘). 밤엔 조금 더.
                            let frameT = ctx.date.timeIntervalSinceReferenceDate
                            Canvas { g, size in
                                _ = frameT
                                if world.mode == .rain { drawRain(world, in: &g) } else { drawFlakes(world.flakes, in: &g) }
                            }
                            .opacity(level)
                            if w == .storm { Color.white.opacity(world.flash).allowsHitTesting(false) }
                        }
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onAppear { level = 0; withAnimation(.easeInOut(duration: 2.0)) { level = wet ? 1 : 0 }; if wet { a.beginMotion() } }
        .onChange(of: wet) { _, now in
            withAnimation(.easeInOut(duration: 2.0)) { level = now ? 1 : 0 }
            if now { a.beginMotion() } else { a.endMotion() }
        }
        .onDisappear { if wet { a.endMotion() } }
    }

    private func drawRain(_ w: RainWorld, in g: inout GraphicsContext) {
        let d = w.rainDir
        // 빗줄기 — 가늘고 양끝이 흐려지는 선(둥근 끝 X: 막대기처럼 보였다). 먼 층 0.6pt·가까운 층 1.0pt.
        for s in w.streaks {
            let head = CGPoint(x: s.x, y: s.y), tail = CGPoint(x: s.x - d.dx * s.len, y: s.y - d.dy * s.len)
            var p = Path(); p.move(to: tail); p.addLine(to: head)
            let a = (s.near ? 0.8 : 0.5) * s.alpha
            g.stroke(p, with: .linearGradient(Gradient(stops: [.init(color: .white.opacity(0), location: 0),
                                                               .init(color: .white.opacity(a), location: 0.2),
                                                               .init(color: .white.opacity(a), location: 0.8),
                                                               .init(color: .white.opacity(0), location: 1)]),
                                              startPoint: tail, endPoint: head),
                     style: StrokeStyle(lineWidth: s.near ? 1.2 : 0.75, lineCap: .butt))
        }
        // 카드 윗면에서 튀는 아주 작은 물보라·모서리에서 떨어지는 방울
        for p in w.splashes {
            let r: CGFloat = p.life > 1 ? 1.1 : 0.7
            g.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(.white.opacity(0.75)))
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
                g.fill(p, with: .linearGradient(Gradient(colors: [Color(red: 0.70, green: 0.80, blue: 0.90, opacity: 0.35), Color(red: 0.45, green: 0.55, blue: 0.68, opacity: 0.45)]),
                                                startPoint: CGPoint(x: 0, y: size.height - 6), endPoint: CGPoint(x: 0, y: size.height)))
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
