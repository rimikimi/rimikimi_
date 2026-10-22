import SwiftUI

/// 홈 배경 — 유리 위 빗방울(흰 바탕이라 굴절 대신 실제 물방울처럼 보이는 명암: 가는 테, 아래쪽 맺힌 빛, 위 하이라이트, 아래 그늘)
/// 또는 내리는 눈송이. 카드 **뒤**에 깔리므로 카드 사진엔 물이 안 묻는다(루버). 뇌우면 가끔 번개(화면이 두어 번 번쩍).
struct WeatherBackdrop: View {
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        let a = Ambient.shared
        let w = a.current
        if w == .rain || w == .snow || w == .storm {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: scenePhase != .active || a.reduced)) { ctx in
                GeometryReader { geo in
                    let world = RainWorld.shared
                    let _ = { world.wind = a.windPush }()
                    let _ = world.step(now: ctx.date, size: geo.size, gravity: a.simGravity, mode: w == .snow ? .snow : .rain,
                                       heavy: w == .storm)
                    ZStack {
                        let frameT = ctx.date.timeIntervalSinceReferenceDate
                        Canvas { g, size in
                            // 프레임 시각을 읽어야 SwiftUI 가 매 프레임 다시 그린다(안 읽으면 같은 그림으로 보고 건너뛴다).
                            _ = frameT
                            if world.mode == .rain { drawDrops(world.drops, in: &g) } else { drawFlakes(world.flakes, in: &g) }
                        }
                        if w == .storm { Color.white.opacity(world.flash).allowsHitTesting(false) }
                    }
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .onAppear { a.beginMotion() }
            .onDisappear { a.endMotion() }
        }
    }

    private func drawDrops(_ drops: [RainWorld.Drop], in g: inout GraphicsContext) {
        for d in drops {
            let v = hypot(d.vx, d.vy)
            // 흐르는 방울은 꼬리 쪽으로 늘어난 눈물방울
            let stretch = d.sliding ? min(2.4, 1 + v / 40) : 1
            let ang = d.sliding ? atan2(d.vy, d.vx) - .pi / 2 : 0
            var t = g
            t.translateBy(x: d.x, y: d.y)
            t.rotate(by: .radians(ang))
            let r = d.r
            var body = Path()
            body.move(to: CGPoint(x: 0, y: -r * stretch))                                    // 꼬리(위)
            body.addCurve(to: CGPoint(x: r, y: r * 0.15), control1: CGPoint(x: r * 0.35, y: -r * stretch * 0.55), control2: CGPoint(x: r, y: -r * 0.45))
            body.addArc(center: CGPoint(x: 0, y: r * 0.15), radius: r, startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
            body.addCurve(to: CGPoint(x: 0, y: -r * stretch), control1: CGPoint(x: -r, y: -r * 0.45), control2: CGPoint(x: -r * 0.35, y: -r * stretch * 0.55))
            // 아래 그늘(유리 뒤 바탕에 드리운)
            t.fill(body.offsetBy(dx: r * 0.18, dy: r * 0.45), with: .color(.black.opacity(0.10)))
            // 몸통 — 거의 투명, 위는 살짝 어둡고 아래로 갈수록 밝게(빛이 바닥에 모인다)
            t.fill(body, with: .linearGradient(Gradient(colors: [Color(white: 0.62, opacity: 0.55), Color(white: 0.86, opacity: 0.45), Color.white.opacity(0.85)]),
                                               startPoint: CGPoint(x: 0, y: -r * stretch), endPoint: CGPoint(x: 0, y: r * 1.15)))
            // 가는 테
            t.stroke(body, with: .color(.black.opacity(0.26)), lineWidth: max(0.6, r * 0.14))
            // 위 하이라이트
            let hr = max(0.6, r * 0.32)
            t.fill(Path(ellipseIn: CGRect(x: -r * 0.45, y: -r * 0.35, width: hr, height: hr * 0.8)), with: .color(.white.opacity(0.95)))
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
    func body(content: Content) -> some View {
        let a = Ambient.shared
        let w = a.current
        if w == .rain || w == .snow || w == .storm {
            content
                .overlay(alignment: .top) {
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: a.reduced)) { ctx in
                        let frameT = ctx.date.timeIntervalSinceReferenceDate
                        GeometryReader { geo in
                            let _ = frameT
                            let f = geo.frame(in: .global)
                            let _ = DispatchQueue.main.async { RainWorld.shared.report(id: id, frame: f) }
                            LedgeShape(levels: RainWorld.shared.level(of: id), snow: w == .snow)
                                .frame(width: geo.size.width, height: 14)
                                .offset(y: -14 + 1.5)       // 카드 윗변 바로 위에 얹힌다
                        }
                    }
                    .allowsHitTesting(false)
                }
        } else {
            content
        }
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
                pts.append(CGPoint(x: x, y: size.height - levels[i]))
            }
            var p = Path()
            p.move(to: CGPoint(x: 0, y: size.height))
            p.addLine(to: CGPoint(x: 0, y: pts[0].y))
            for i in 1..<n { p.addQuadCurve(to: CGPoint(x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2), control: pts[i - 1]) }
            p.addLine(to: CGPoint(x: size.width, y: pts[n - 1].y))
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
                var surf = Path(); surf.move(to: CGPoint(x: 0, y: pts[0].y))
                for i in 1..<n { surf.addQuadCurve(to: CGPoint(x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2), control: pts[i - 1]) }
                surf.addLine(to: CGPoint(x: size.width, y: pts[n - 1].y))
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
