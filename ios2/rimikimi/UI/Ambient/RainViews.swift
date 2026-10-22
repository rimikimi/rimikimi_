import SwiftUI
import UIKit

/// 비 스프라이트 — 사진처럼 음영을 넣어 미리 렌더한 이미지(scripts/rain-sprites.py). 코드로 그린 선·점은 납작해 보였다(오너 "그래픽을 끌어올려").
enum RainSprites {
    static func load(_ n: String) -> Image {
        // ⚠️ 미리 풀어 둔다(preparingForDisplay) — contentsOfFile 은 그릴 때마다 PNG 를 다시 디코딩해서
        //    매 프레임 CPU 를 잡아먹었다(샘플링에서 PNG 디코드·vImage 변환이 상위).
        let ui = UIImage(contentsOfFile: Bundle.main.path(forResource: n, ofType: "png") ?? "") ?? UIImage()
        return Image(uiImage: ui.preparingForDisplay() ?? ui)
    }
    static let streaks = (0..<5).map { load("streak\($0)") }
    static let drop = load("drop")
    static let dropFall = load("drop_fall")
    static let crown = (0..<6).map { load("crown\($0)") }
    static let flakes = (0..<4).map { load("flake\($0)") }
    static let flakeBokeh = load("flake_bokeh")
    static let snowTex = load("snow_tex")
}

/// 홈 배경(색은 그대로) 위로 쏟아지는 빗줄기(바람·기울기만큼 비스듬히) 또는 내리는 눈송이. 카드 **뒤**에 깔리므로 카드 사진엔 물이 안 묻는다(루버). 뇌우면 가끔 번개(화면이 두어 번 번쩍).
/// 비 오는 날 배경만 살짝 어둡게(해가 가려진 빛) — 앨범·카드는 그대로. 홈 `.background` 에 깐다. 2초에 걸쳐 서서히.
struct WeatherDim: View {
    @State private var level: Double = 0
    var body: some View {
        let a = Ambient.shared
        let rainy = a.current == .rain || a.current == .storm || a.current == .snow
        TimelineView(.periodic(from: .now, by: 60)) { ctx in
            let night = a.phase(at: ctx.date) == "night"
            Color(red: 0.10, green: 0.13, blue: 0.19).opacity((night ? 0.42 : (a.current == .storm ? 0.32 : a.current == .snow ? 0.14 : 0.24)) * level)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeInOut(duration: 2.0)) { level = rainy ? 1 : 0 } }
        .onChange(of: rainy) { _, now in withAnimation(.easeInOut(duration: 2.0)) { level = now ? 1 : 0 } }
    }

    /// 물 묻는 액자 — 4개 중 1개꼴. id 로 고정해서 스크롤해도 같은 액자가 젖어 있다(hashValue 는 실행마다 바뀌어서 안 씀).
    static func isWet(_ id: String) -> Bool {
        var h: UInt32 = 2166136261
        for b in id.utf8 { h = (h ^ UInt32(b)) &* 16777619 }
        return h % 4 == 0
    }
}

enum WxDebug {
    static var noFace: Bool { UserDefaults.standard.bool(forKey: "wx.noFace") }
    static var noBack: Bool { UserDefaults.standard.bool(forKey: "wx.noBack") }
    static var noLedge: Bool { UserDefaults.standard.bool(forKey: "wx.noLedge") }
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
        let wet = (w == .rain || w == .snow || w == .storm) && !WxDebug.noBack
        ZStack {
            if wet || level > 0.001 {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: scenePhase != .active || a.reduced)) { ctx in
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
                                    if world.mode == .rain { drawStreaks(world, in: &g) } else { drawFlakes(world, front: false, in: &g) }
                                } else if world.mode == .rain { drawStreaks(world, in: &g, front: true); drawFaceWater(world, in: &g); drawSplashes(world, in: &g) }
                                else { drawFlakes(world, front: true, in: &g) }
                            }
                            .opacity(level)
                            if w == .storm && layer == .back && world.flash > 0.01 {
                                // 번개 — 액자 뒤 하늘이 밝아지고, 갈라지는 줄기가 번쩍(바깥 번짐 + 흰 심)
                                Color(red: 0.86, green: 0.88, blue: 1.0).opacity(world.flash * 0.35)
                                Canvas { g, _ in
                                    for (pass, blur, wmul, a) in [(0, 9.0, 5.0, 0.45), (1, 2.5, 2.2, 0.75), (2, 0.0, 1.0, 1.0)] as [(Int, Double, CGFloat, Double)] {
                                        _ = pass
                                        g.drawLayer { l in
                                            if blur > 0 { l.addFilter(.blur(radius: blur)) }
                                            for b in world.bolts {
                                                var p = Path(); p.addLines(b.pts)
                                                l.stroke(p, with: .color(Color(red: 0.92, green: 0.94, blue: 1.0).opacity(a * world.flash)),
                                                         style: StrokeStyle(lineWidth: b.width * wmul, lineCap: .round, lineJoin: .round))
                                            }
                                        }
                                    }
                                }
                            }
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
            // 물보라 모양이 매번 같지 않게 — 위치값으로 좌우 뒤집기·크기·살짝 기울기를 바꾼다
            let seed = Int(abs(r.x * 13 + r.y * 7)) 
            let sc: CGFloat = 0.75 + CGFloat(seed % 5) * 0.12
            var c = g
            c.translateBy(x: r.x, y: r.y)
            c.rotate(by: .degrees(Double(seed % 9) - 4))
            c.scaleBy(x: seed % 2 == 0 ? sc : -sc, y: sc)
            c.draw(crown[f], in: CGRect(x: -10, y: -15.6, width: 20, height: 20))
        }
        // 튀는·떨어지는 물방울 — 떨어지는 방울은 크기 제각각, 빨라질수록 늘어나고 살짝 흔들린다
        for p in w.splashes {
            let v = max(1, hypot(p.vx, p.vy)), falling = p.life > 1
            let wdt: CGFloat = falling ? max(1.2, p.size > 0 ? p.size : 3.4) : 2.0
            let h = wdt * min(falling ? 2.8 : 2.4, 1 + v / (falling ? 160 : 90))
            var c = g
            c.translateBy(x: p.x, y: p.y)
            c.rotate(by: .radians(atan2(p.vy, p.vx) - .pi / 2 + (falling ? Double(sin(p.y * 0.09)) * 0.05 : 0)))
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

    private func drawFlakes(_ w: RainWorld, front: Bool, in g: inout GraphicsContext) {
        let flakes = RainSprites.flakes.map { g.resolve($0) }, bokeh = g.resolve(RainSprites.flakeBokeh)
        let mine = w.flakes.filter { front ? $0.plane == .front : $0.plane != .front }
        // 흰 바탕에서도 보이게 아주 옅은 그늘을 깐 뒤 눈송이
        g.drawLayer { l in
            l.addFilter(.shadow(color: Color(red: 0.2, green: 0.25, blue: 0.35).opacity(0.38), radius: 1.0, y: 0.5))
            for f in mine where !f.bokeh {
                let s = f.r * 2.6
                var c = l; c.translateBy(x: f.x, y: f.y); c.rotate(by: .radians(Double(f.phase) * 0.4))
                c.draw(flakes[f.kind], in: CGRect(x: -s / 2, y: -s / 2, width: s, height: s))
            }
        }
        g.drawLayer { l in
            l.addFilter(.blur(radius: 1.5))
            for f in mine where f.bokeh { l.draw(bokeh, in: CGRect(x: f.x - f.r, y: f.y - f.r, width: f.r * 2, height: f.r * 2)) }
        }
        guard front else { return }
        // 미끄러져 떨어지는 눈 덩어리
        g.drawLayer { l in
            l.addFilter(.shadow(color: .black.opacity(0.2), radius: 1, y: 0.5))
            for c in w.snowClumps { l.draw(flakes[Int(c.r * 10) % 4], in: CGRect(x: c.x - c.r * 1.6, y: c.y - c.r * 1.6, width: c.r * 3.2, height: c.r * 3.2)) }
        }
        // 액자 앞면에 내려앉아 녹는 눈 — 흰 송이가 점점 투명한 물방울로
        let drop = g.resolve(RainSprites.drop)
        for m in w.melts {
            guard let l = w.ledgeFrame(m.id) else { continue }
            let t = min(1, m.age / 4)
            let x = l.minX + m.rx, y = l.minY + m.ry + t * 2
            let s = m.r * (2.4 - 1.2 * t)
            var c = g; c.opacity = Double(1 - t) * (m.age > 6 ? Double(7 - m.age) : 1)
            c.draw(flakes[Int(m.rx) % 4], in: CGRect(x: x - s / 2, y: y - s / 2, width: s, height: s))
            var c2 = g; c2.opacity = Double(t) * (m.age > 6 ? Double(7 - m.age) : 1)
            let ds = m.r * 1.3
            c2.draw(drop, in: CGRect(x: x - ds / 2, y: y - ds / 2, width: ds, height: ds))
        }
    }

    /// 액자 앞면에 묻은 물방울·흘러내림·아랫변에 맺힌 물방울
    private func drawFaceWater(_ w: RainWorld, in g: inout GraphicsContext) {
        let drop = g.resolve(RainSprites.drop)
        // 앞면 물방울·물길은 카드 셰이더(.faceWater)가 굴절로 그린다. 여기선 아랫변에 맺힌 방울만.
        for (id, list) in w.hangs {
            guard let f = w.ledgeFrame(id) else { continue }
            for h in list where h.r > 0.4 {
                let x = f.minX + h.rx, sz = h.r * 2.2
                let ripe = max(0, (h.r - h.limit * 0.7) / (h.limit * 0.3))          // 떨어지기 직전 — 목이 늘어진다
                let sway = sin(h.wobble * 9) * 0.08 * ripe
                let neckLen = sz * 0.45 * ripe
                if neckLen > 0.3 {
                    var neck = Path()
                    neck.move(to: CGPoint(x: x - sz * 0.22, y: f.maxY))
                    neck.addQuadCurve(to: CGPoint(x: x - sz * 0.12, y: f.maxY + neckLen), control: CGPoint(x: x - sz * 0.08, y: f.maxY + neckLen * 0.4))
                    neck.addLine(to: CGPoint(x: x + sz * 0.12, y: f.maxY + neckLen))
                    neck.addQuadCurve(to: CGPoint(x: x + sz * 0.22, y: f.maxY), control: CGPoint(x: x + sz * 0.08, y: f.maxY + neckLen * 0.4))
                    g.fill(neck, with: .color(Color(white: 0.92).opacity(0.5)))
                }
                var c = g
                c.translateBy(x: x, y: f.maxY + neckLen)
                c.rotate(by: .radians(Double(sway)))
                c.draw(drop, in: CGRect(x: -sz / 2, y: -sz * 0.3, width: sz, height: sz * (1 + 0.25 * ripe)))
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
        let wet = (w == .rain || w == .snow || w == .storm) && !WxDebug.noLedge
        content
            .overlay(alignment: .top) {
                if wet || level > 0.001 {
                    TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: a.reduced)) { ctx in
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
                // 쌓인 눈 — 알갱이 결 텍스처 + 아래 그늘 + 윗면 반짝임 + 가장자리 보송보송
                let tex = g.resolve(RainSprites.snowTex)
                g.drawLayer { l in
                    l.addFilter(.shadow(color: .black.opacity(0.16), radius: 1.6, y: 0.6))
                    l.clip(to: p)
                    l.draw(tex, in: CGRect(x: 0, y: size.height - 12, width: max(size.width, 128), height: 12))
                }
                var ridge = Path(); ridge.move(to: pts[0])
                for i in 1..<n { ridge.addQuadCurve(to: CGPoint(x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2), control: pts[i - 1]) }
                g.drawLayer { l in
                    l.addFilter(.blur(radius: 0.6))
                    l.stroke(ridge, with: .color(.white), lineWidth: 1.4)
                }
                for i in stride(from: 1, to: n - 1, by: 2) where levels[i] > 2 {
                    let q = pts[i]
                    g.fill(Path(ellipseIn: CGRect(x: q.x - 0.6 + CGFloat(i % 3), y: q.y + 1.2, width: 1.2, height: 1.2)), with: .color(.white))
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


/// 액자 앞면 빗물 — 게임에서 쓰는 유리창 빗물 셰이더(WindowRain.metal). 칸마다 물방울이 맺혀 커지다 미끄러지며 자국을 남기고,
/// 잔방울이 생겼다 사라지고, 모두 렌즈처럼 뒤 사진을 굴절시킨다. '아래' = 폰 기울기(중력) 방향.
struct FaceWaterModifier: ViewModifier {
    let id: String
    @State private var level: Double = 0
    func body(content: Content) -> some View {
        let a = Ambient.shared
        // ⚠️ 성능: 액자마다 셰이더를 돌리면 매 프레임 액자 전체를 다시 그려서 CPU·GPU 를 거의 다 먹었다(측정: 비 82% → 셰이더 끄면 6%).
        //    그래서 물이 묻는 액자를 몇 개로만 고른다(오너 "창문에 묻는 물방울이 넘 많음"도 같이 해결) — 나머지는 셰이더·타임라인 아예 꺼짐.
        let wet = Self.isWet(id)
        let rainy = (a.current == .rain || a.current == .storm) && !WxDebug.noFace && wet
        TimelineView(.animation(minimumInterval: 1.0 / 24.0, paused: a.reduced || (!rainy && level < 0.001))) { ctx in
            let g = a.simGravity
            let gl = max(0.2, hypot(g.dx, g.dy))
            let down = CGPoint(x: g.dx / gl, y: max(0.15, g.dy) / gl)
            let t = Float(ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 10000))
            let seed = Float(abs(id.hashValue % 97)) / 97
            content.visualEffect { v, proxy in
                v.layerEffect(ShaderLibrary.windowRain(.float2(proxy.size), .float(t), .float(Float(level) * (a.current == .storm ? 0.4 : 0.24)),
                                                       .float2(down), .float(seed)),
                              maxSampleOffset: CGSize(width: 30, height: 30), isEnabled: level > 0.001)
            }
        }
        .onAppear { withAnimation(.easeInOut(duration: 2.0)) { level = rainy ? 1 : 0 } }
        .onChange(of: rainy) { _, now in withAnimation(.easeInOut(duration: 2.0)) { level = now ? 1 : 0 } }
    }

    /// 물 묻는 액자 — 4개 중 1개꼴. id 로 고정해서 스크롤해도 같은 액자가 젖어 있다(hashValue 는 실행마다 바뀌어서 안 씀).
    static func isWet(_ id: String) -> Bool {
        var h: UInt32 = 2166136261
        for b in id.utf8 { h = (h ^ UInt32(b)) &* 16777619 }
        return h % 4 == 0
    }
}

extension View {
    func faceWater(id: String) -> some View { modifier(FaceWaterModifier(id: id)) }
}
