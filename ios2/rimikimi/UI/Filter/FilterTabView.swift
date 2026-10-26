import SwiftUI

/// 필터 탭 — "오늘의 필터" 히어로 + 카메라 진입 + 그룹별 3열 격자(시안 A, 오너 선택 2026-09-22).
///
/// 예전엔 똑같이 생긴 가로 줄 세 개가 세로로 쌓여 있어 필터가 작고 위계도 없었다("배열이 구식임").
/// 지금은 ① 큰 전/후 비교샷 한 장으로 필터가 뭘 하는지 바로 보여 주고 ② 나머지는 3열 격자로
/// 훑게 한다. 미리보기는 전부 **3:4**(오너 지시) — `fs_*.webp` 원본이 800px 이라 크게 써도 안 뭉갠다.
// 2026-10-26: 미리보기는 필터 결과만(ff_*) — 원본과 나란히 놓지 않는다(오너 "샘플만 보여주면 안 됨? 경쟁사 방법").
struct FilterTabView: View {
    @Environment(AppState.self) private var app
    /// 즐겨찾는 필터 — 카메라 탭과 같은 저장소("filter.favorites")를 쓴다(한쪽에서 넣으면 양쪽에 보인다).
    @State private var favs: [String] = UserDefaults.standard.stringArray(forKey: FilterFavorites.key) ?? []

    struct Preset: Identifiable { let key: String; var label: String { Copy.filterName(key) }; var id: String { key } }
    struct Group: Identifiable { let key: String; let title: String; let emoji: String; let presets: [Preset]; var id: String { key } }

    // 그룹 제목이 번역 문구라 `static let` 이면 처음 읽은 언어로 굳는다(앱 안 언어 전환) — 볼 때마다 만든다.
    static var groups: [Group] { [
        // 폰카 — 연도별 아이폰 색감. 이름은 모델 번호만(오너 지시 2026-09-23, "iPhone" 은 안 붙인다).
        // 이름(ko/en)은 `Copy.filterNames` — 여기는 key 만.
        .init(key: "phone", title: Copy.filterGroupPhone, emoji: "📱", presets: [
            .init(key: "ph16pro"), .init(key: "ph15pro"), .init(key: "ph14pro"),
            .init(key: "phxs"), .init(key: "ph7"), .init(key: "ph6s"),
            .init(key: "ph4s"), .init(key: "ph3gs"), .init(key: "folder"),
        ]),
        .init(key: "vintage", title: Copy.filterGroupVintage, emoji: "📸", presets: [
            .init(key: "vintC"), .init(key: "vintL"), .init(key: "vintP"),
            .init(key: "vintG"), .init(key: "vintS"), .init(key: "vintF"), .init(key: "haduri"),
        ]),
        // 감성 = 예전 필름·카메라·재미를 한 칸으로(오너 2026-10-12 "폰카, 빈티지, 감성 3개")
        .init(key: "mood", title: Copy.filterGroupMood, emoji: "🎞️", presets: [
            .init(key: "golden"), .init(key: "peach"), .init(key: "slide"),
            .init(key: "retro"), .init(key: "vivid"), .init(key: "green"),
            .init(key: "pastel"), .init(key: "cine"), .init(key: "newtro"),
            .init(key: "softmono"),
            .init(key: "warm"), .init(key: "cool"), .init(key: "vintage"),
            .init(key: "docu"), .init(key: "mono"), .init(key: "digicam"), .init(key: "y2k"),
            .init(key: "toy"), .init(key: "dispo"), .init(key: "instant"),
        ]),
        // 효과 — 색감보다 효과가 주인 필터(2026-10-26 필터 탭 개편 시안: 폰카·빈티지·감성·효과)
        .init(key: "fx", title: L.t("효과", "Effects"), emoji: "✨", presets: [
            .init(key: "flashsoft"), .init(key: "bloom"), .init(key: "vhs"), .init(key: "glitch"), .init(key: "pixelate"),
        ]),
    ] }

    /// 추천 필터 — 사용 기록이 쌓이기 전까지는 직접 고른 목록(시안, 2026-10-26).
    static let featuredKeys = ["ph7", "golden", "vintC", "peach", "ph4s", "bloom", "cine", "vintS"]
    /// 신규 필터 — 월 3개 드롭 자리. 지금은 가장 최근에 추가된 빈티지 3종(시안).
    static let newKeys = ["folder", "y2k", "haduri", "flashsoft"]

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
        // 만들기 탭과 같은 짜임(오너 2026-10-26): 추천 · 신규 가로 줄 → 그룹 앨범 3열.
        // 위 카드(말로 고치기·복원)와 목적 칸은 AI 기능이라 넣지 않는다.
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if !favs.isEmpty { rail(L.t("즐겨찾는 필터", "Favorites"), favs, isNew: false) }
                rail(L.t("추천 필터", "Featured"), Self.featuredKeys, isNew: false)
                rail(L.t("신규 필터", "New"), Self.newKeys, isNew: true)
                Text(L.t("필터 앨범", "Filter albums")).font(AppFont.headline).tracking(Tracking.headline)
                    .foregroundStyle(Color.ink).padding(.horizontal, Spacing.page).padding(.top, Spacing.s2).padding(.bottom, Spacing.s3)
                LazyVGrid(columns: columns, spacing: Spacing.s4) {
                    ForEach(Self.groups) { g in albumTile(g) }
                }
                .padding(.horizontal, Spacing.page)
            }
            .padding(.top, Spacing.s2)
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(Copy.filterTitle)
        .onAppear { favs = FilterFavorites.load() }
    }

    private func rail(_ title: String, _ keys: [String], isNew: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                Text(title).font(AppFont.sectionTitle).tracking(Tracking.sectionTitle)
                if isNew { NewBadge() }
                Spacer()
            }
            .padding(.horizontal, Spacing.page).padding(.top, Spacing.s1).padding(.bottom, Spacing.s3 - 2)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: CardMetrics.railGap) {
                    ForEach(keys, id: \.self) { k in
                        FilterFlipCard(key: k, favs: $favs, app: app)
                            .shadow(color: .black.opacity(0.10), radius: 12, y: 8)
                            .containerRelativeFrame(.horizontal) { w, _ in (w * CardMetrics.railCardFraction).rounded() }
                    }
                }
                .padding(.horizontal, Spacing.page)
                .scrollTargetLayout()
            }
            .scrollIndicators(.hidden)
            .scrollTargetBehavior(.viewAligned)
            .padding(.bottom, CardMetrics.railBottom)
        }
    }

    private func albumTile(_ g: Group) -> some View {
        NavigationLink {
            FilterGroupGrid(group: g)
        } label: {
            RemoteImage(url: Config.thumbURL("ff_\(g.presets.first?.key ?? "")"), cornerRadius: 0, fallback: Config.thumbURL("fs_\(g.presets.first?.key ?? "")"))
                .photoRatio()
                .overlay(alignment: .bottomLeading) { PhotoCaption(title: g.title, subtitle: "\(g.presets.count)", size: 15) }
                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
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
            }
            Spacer(minLength: Spacing.s2)
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
                RemoteImage(url: Config.thumbURL("ff_\(p.key)"), cornerRadius: Radius.card - 2, fallback: Config.thumbURL("fs_\(p.key)"))
                    .photoRatio()
                Text(p.label)
                    .font(AppFont.footnote).foregroundStyle(Color.ink)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}


/// 필터 앨범 안 — 그 그룹 필터를 3열 격자로(누르면 사진 고르기 → 편집기).
struct FilterGroupGrid: View {
    @Environment(AppState.self) private var app
    var group: FilterTabView.Group
    @State private var favs: [String] = FilterFavorites.load()
    private let columns = Array(repeating: GridItem(.flexible(), spacing: Spacing.s2), count: 3)
    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: Spacing.s3) {
                ForEach(group.presets) { p in
                    VStack(spacing: 6) {
                        FilterFlipCard(key: p.key, favs: $favs, app: app, captionSize: nil, cornerRadius: Radius.card - 2, starSize: 26)
                        Text(p.label).font(AppFont.footnote).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.85)
                    }
                }
            }
            .padding(.horizontal, Spacing.page).padding(.top, Spacing.s2)
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .background(Color.bg)
        .inlineTitle("\(group.emoji) \(group.title)")
        .onAppear { favs = FilterFavorites.load() }
    }
}


/// 필터 즐겨찾기 — 카메라 탭(길게 누르기)과 같은 저장소. 필터 탭에선 길게 눌러 메뉴로 넣고 뺀다(2026-10-26 오너).
@MainActor enum FilterFavorites {
    static let key = "filter.favorites"
    static func load() -> [String] { UserDefaults.standard.stringArray(forKey: key) ?? [] }
    /// 카드 오른쪽 위 별 — 누르면 바로 즐겨찾기(컨셉 별과 같은 노란 별, 꺼져 있으면 흰 테두리 별).
    static func starButton(_ k: String, favs: Binding<[String]>, app: AppState, size: CGFloat = 32) -> some View {
        let on = favs.wrappedValue.contains(k)
        return Button { toggle(k, favs: favs, app: app) } label: {
            Image(systemName: on ? "star.fill" : "star")
                .font(.system(size: size * 0.5, weight: .semibold))
                .foregroundStyle(on ? Color.favoriteStar : .white)
                .frame(width: size, height: size)
                .background(.black.opacity(0.35), in: Circle())
                .contentTransition(.symbolEffect(.replace))
                .padding(6)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(on ? Copy.favoriteRemove : Copy.favoriteAdd)
    }
    static func toggle(_ k: String, favs: Binding<[String]>, app: AppState) {
        let on = favs.wrappedValue.contains(k)
        var f = load()
        if let i = f.firstIndex(of: k) { f.remove(at: i) } else { f.append(k) }
        UserDefaults.standard.set(f, forKey: key); withAnimation(.snappy) { favs.wrappedValue = f }
        app.showToast(on ? L.t("즐겨찾는 필터에서 뺐어요", "Removed from favorites") : L.t("즐겨찾는 필터에 넣었어요", "Added to favorites"))
        HapticPlayer.selection()
    }
    @ViewBuilder static func menuItem(_ k: String, favs: Binding<[String]>, app: AppState) -> some View {
        let on = favs.wrappedValue.contains(k)
        Button { toggle(k, favs: favs, app: app) } label: {
            Label(on ? Copy.favoriteRemove : Copy.favoriteAdd, systemImage: on ? "star.slash" : "star")
        }
    }
}
