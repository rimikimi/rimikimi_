import SwiftUI

/// 필터 탭 — "오늘의 필터" 히어로 + 카메라 진입 + 그룹별 3열 격자(시안 A, 오너 선택 2026-09-22).
///
/// 예전엔 똑같이 생긴 가로 줄 세 개가 세로로 쌓여 있어 필터가 작고 위계도 없었다("배열이 구식임").
/// 지금은 ① 큰 전/후 비교샷 한 장으로 필터가 뭘 하는지 바로 보여 주고 ② 나머지는 3열 격자로
/// 훑게 한다. 미리보기는 전부 **3:4**(오너 지시) — `fs_*.webp` 원본이 800px 이라 크게 써도 안 뭉갠다.
struct FilterTabView: View {
    @Environment(AppState.self) private var app

    struct Preset: Identifiable { let key: String; var label: String { Copy.filterName(key) }; var id: String { key } }
    struct Group: Identifiable { let key: String; let title: String; let emoji: String; let presets: [Preset]; var id: String { key } }

    static let groups: [Group] = [
        // 폰카 — 연도별 아이폰 색감. 이름은 모델 번호만(오너 지시 2026-09-23, "iPhone" 은 안 붙인다).
        // 이름(ko/en)은 `Copy.filterNames` — 여기는 key 만.
        .init(key: "phone", title: Copy.filterGroupPhone, emoji: "📱", presets: [
            .init(key: "ph16pro"), .init(key: "ph15pro"), .init(key: "ph14pro"),
            .init(key: "phxs"), .init(key: "ph7"), .init(key: "ph6s"),
            .init(key: "ph4s"), .init(key: "ph3gs"),
        ]),
        .init(key: "film", title: Copy.filterGroupFilm, emoji: "🎞️", presets: [
            .init(key: "golden"), .init(key: "peach"), .init(key: "slide"),
            .init(key: "retro"), .init(key: "vivid"), .init(key: "green"),
            .init(key: "pastel"), .init(key: "cine"), .init(key: "newtro"),
            .init(key: "softmono"),
        ]),
        .init(key: "camera", title: Copy.filterGroupCamera, emoji: "📷", presets: [
            .init(key: "warm"), .init(key: "cool"), .init(key: "vintage"),
            .init(key: "docu"), .init(key: "mono"), .init(key: "digicam"),
            .init(key: "toy"), .init(key: "dispo"), .init(key: "instant"),
        ]),
        .init(key: "fun", title: Copy.filterGroupFun, emoji: "✨", presets: [
            .init(key: "sepia"), .init(key: "duopink"), .init(key: "neon"),
            .init(key: "thermal"), .init(key: "glitch"), .init(key: "vhs"),
            .init(key: "pixelate"), .init(key: "sketch"),
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
        .inlineTitle(Copy.filterTitle)
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
            pill(Copy.filterOriginal).frame(maxWidth: .infinity)
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
                Text(Copy.todaysFilter(t.group.title))
                    .font(AppFont.caption).foregroundStyle(.white.opacity(0.85))
                Text(t.preset.label)
                    .font(AppFont.sectionTitle).foregroundStyle(.white)
                Text(Copy.filterTapToStart)
                    .font(AppFont.footnote).foregroundStyle(.white.opacity(0.85))
            }
            Spacer(minLength: Spacing.s2)
            VStack(alignment: .trailing, spacing: 4) {
                pill(Copy.filterUpTo10)
                pill(Copy.filterAllFree)
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
                Text(Copy.filterShootCamera).font(AppFont.bodyEmphasis).foregroundStyle(Color.onInk)
                // 문구 정정(2026-09-22): 아이폰 기본 카메라로 바뀌며 촬영 중 라이브 필터가 없어졌고,
                // 지금은 연속 촬영(여러 장) → 한 번에 필터다. 실제 동작과 다른 문구는 심사(2.3.1)에서 걸린다.
                Text(Copy.filterShootCameraSub)
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
                    .photoRatio()
                Text(p.label)
                    .font(AppFont.footnote).foregroundStyle(Color.ink)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}
