import SwiftUI

/// 필터 탭 — "오늘의 필터" 히어로 + 카메라 진입 + 그룹별 3열 격자(시안 A, 오너 선택 2026-09-22).
///
/// 예전엔 똑같이 생긴 가로 줄 세 개가 세로로 쌓여 있어 필터가 작고 위계도 없었다("배열이 구식임").
/// 지금은 ① 큰 전/후 비교샷 한 장으로 필터가 뭘 하는지 바로 보여 주고 ② 나머지는 3열 격자로
/// 훑게 한다. 미리보기는 전부 **3:4**(오너 지시) — `fs_*.webp` 원본이 800px 이라 크게 써도 안 뭉갠다.
struct FilterTabView: View {
    @Environment(AppState.self) private var app

    struct Preset: Identifiable { let key: String; let label: String; var id: String { key } }
    struct Group: Identifiable { let key: String; let title: String; let emoji: String; let presets: [Preset]; var id: String { key } }

    static let groups: [Group] = [
        .init(key: "film", title: "필름", emoji: "🎞️", presets: [
            .init(key: "golden", label: "골든"), .init(key: "peach", label: "피치"), .init(key: "slide", label: "슬라이드"),
            .init(key: "retro", label: "레트로"), .init(key: "vivid", label: "비비드"), .init(key: "green", label: "그린"),
            .init(key: "pastel", label: "파스텔"), .init(key: "cine", label: "시네"), .init(key: "newtro", label: "뉴트로"),
            .init(key: "softmono", label: "소프트 모노"),
        ]),
        .init(key: "camera", title: "카메라", emoji: "📷", presets: [
            .init(key: "warm", label: "웜톤"), .init(key: "cool", label: "쿨톤"), .init(key: "vintage", label: "빈티지"),
            .init(key: "docu", label: "다큐"), .init(key: "mono", label: "모노"), .init(key: "digicam", label: "디지캠"),
            .init(key: "toy", label: "토이"), .init(key: "dispo", label: "일회용"), .init(key: "instant", label: "인스턴트"),
        ]),
        .init(key: "fun", title: "재미", emoji: "✨", presets: [
            .init(key: "sepia", label: "세피아"), .init(key: "duopink", label: "듀오 핑크"), .init(key: "neon", label: "네온"),
            .init(key: "thermal", label: "서모"), .init(key: "glitch", label: "글리치"), .init(key: "vhs", label: "VHS"),
            .init(key: "pixelate", label: "모자이크"), .init(key: "sketch", label: "스케치"),
        ]),
    ]

    /// 오늘의 필터 — 날짜로 고르므로 하루 동안 고정이고 매일 바뀐다.
    private var todays: (group: Group, preset: Preset) {
        let all = Self.groups.flatMap { g in g.presets.map { (g, $0) } }
        let day = Calendar(identifier: .gregorian).ordinality(of: .day, in: .era, for: Date()) ?? 0
        return all[day % all.count]
    }

    private let columns = [GridItem(.flexible(), spacing: Spacing.s2),
                           GridItem(.flexible(), spacing: Spacing.s2),
                           GridItem(.flexible(), spacing: Spacing.s2)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                hero
                cameraRow
                ForEach(Self.groups) { g in
                    sectionHeader(g)
                    LazyVGrid(columns: columns, spacing: Spacing.s3) {
                        ForEach(g.presets) { p in tile(p) }
                    }
                    .padding(.horizontal, Spacing.page)
                    .padding(.bottom, Spacing.s5)
                }
            }
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle("필터")
    }

    // MARK: 히어로

    private var hero: some View {
        let t = todays
        return Button { app.requireLogin(.filterPick(presetKey: t.preset.key)) } label: {
            // 세로 3:4 원본을 가로로 넓게 자른다. 가운데로 자르면 **얼굴이 잘린다**(실측) —
            // 위에서 18% 지점부터 보이게 직접 밀어 올린다. `scaledToFill` 의 넘치는 부분은
            // 정렬로는 안 움직여서(ZStack alignment 로 시도했다가 그대로였다) 이 방법을 쓴다.
            GeometryReader { geo in
                let full = geo.size.width / CardMetrics.aspect   // 폭에 맞춘 3:4 전체 높이
                RemoteImage(url: Config.thumbURL("fs_\(t.preset.key)"), cornerRadius: 0)
                    .frame(width: geo.size.width, height: full)
                    .offset(y: -full * 0.18)
            }
                .frame(height: 260)
                .overlay(alignment: .top) { beforeAfterPills(t.preset.label) }
                .overlay(alignment: .bottom) { heroCaption(t) }
                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.985))
        .padding(.horizontal, Spacing.page)
        .padding(.top, Spacing.s2)
        .padding(.bottom, Spacing.s4)
    }

    /// `fs_*` 이미지는 **왼쪽 원본 / 오른쪽 필터** 세로 분할이다 — 그 점을 알약으로 짚어 준다.
    private func beforeAfterPills(_ label: String) -> some View {
        HStack(spacing: 0) {
            pill("원본").frame(maxWidth: .infinity)
            pill(label).frame(maxWidth: .infinity)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s3)
    }

    private func pill(_ text: String) -> some View {
        Text(text)
            .font(AppFont.caption)
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(.white.opacity(0.92), in: Capsule())
    }

    private func heroCaption(_ t: (group: Group, preset: Preset)) -> some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                Text("오늘의 필터 · \(t.group.title)")
                    .font(AppFont.caption).foregroundStyle(.white.opacity(0.85))
                Text(t.preset.label)
                    .font(AppFont.sectionTitle).foregroundStyle(.white)
                Text("탭하면 이 필터로 바로 시작")
                    .font(AppFont.footnote).foregroundStyle(.white.opacity(0.85))
            }
            Spacer(minLength: Spacing.s2)
            VStack(alignment: .trailing, spacing: 4) {
                pill("한 번에 10장까지")
                pill("전부 무료")
            }
        }
        .padding(Spacing.s4)
        .background {
            LinearGradient(colors: [.clear, .black.opacity(0.62)], startPoint: .top, endPoint: .bottom)
        }
    }

    // MARK: 카메라 · 격자

    private var cameraRow: some View {
        Button { app.requireLogin(.camera) } label: {
            HStack(spacing: Spacing.s3) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.onInk)
                Text("카메라로 찍기").font(AppFont.bodyEmphasis).foregroundStyle(Color.onInk)
                // 문구 정정(2026-09-22): 아이폰 기본 카메라로 바뀌며 촬영 중 라이브 필터가 없어졌고,
                // 지금은 연속 촬영(여러 장) → 한 번에 필터다. 실제 동작과 다른 문구는 심사(2.3.1)에서 걸린다.
                Text("· 여러 장 찍고 한 번에 필터")
                    .font(AppFont.footnote).foregroundStyle(Color.onInk.opacity(0.7))
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.onInk.opacity(0.6))
            }
            .padding(.horizontal, Spacing.s4)
            .frame(height: 56)
            .background(Color.ink, in: Capsule())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.985))
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s5)
    }

    private func sectionHeader(_ g: Group) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
            Text("\(g.emoji) \(g.title)").font(AppFont.sectionTitle).tracking(Tracking.sectionTitle)
            Text("\(g.presets.count)").font(AppFont.callout).foregroundStyle(Color.ink3)
            Spacer()
        }
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s3 - 2)
        .accessibilityAddTraits(.isHeader)
    }

    private func tile(_ p: Preset) -> some View {
        Button { app.requireLogin(.filterPick(presetKey: p.key)) } label: {
            VStack(spacing: 6) {
                // 미리보기는 무조건 3:4 (오너 지시 2026-09-22).
                RemoteImage(url: Config.thumbURL("fs_\(p.key)"), cornerRadius: Radius.card - 2)
                    .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                Text(p.label)
                    .font(AppFont.footnote).foregroundStyle(Color.ink)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}
