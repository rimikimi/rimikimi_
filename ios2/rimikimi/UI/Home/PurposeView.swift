import SwiftUI

/// 목적 화면 — 위에 탭, 그 아래 옵션 버튼(시제품: 웨딩·이력서는 버튼이 맨 위), 3열 격자(핀치 5열).
/// 탭 = 크게 보기, 길게 누르기 = 담기(오너 지시 2026-10-09). 담은 건 아래 줄에 모인다.
struct PurposeView: View {
    @Environment(AppState.self) private var app
    var key: String
    @State private var segment: String = ""
    @State private var showKnobs = false
    @State private var pickGroom = false

    private var purpose: Purpose { Purpose(rawValue: key) ?? .concept }

    private var segments: [(key: String, title: String)] {
        switch purpose {
        case .profile:
            // 브루클린 목적 3개(SNS 는 프사·소개팅이 리미키미 일상 스냅이라 넣지 않는다).
            // 탭 이름은 시제품 그대로(오너 확인) — 브루클린 카탈로그 이름(이직·커리어 등)과 다르게 둔다.
            guard app.studio.catalog != nil else { return [] }
            return StudioTab.all.map { ($0, StudioTab.title($0)) }
        case .wedding:
            return [("concepts", L.t("웨딩 컨셉", "Wedding") + " \(app.concepts.concepts(for: .wedding).count)"),
                    ("main", L.t("본식 드레스", "Ceremony gowns") + " \(app.studio.dressList(kind: "main").count)"),
                    ("after", L.t("2부 드레스", "Reception gowns") + " \(app.studio.dressList(kind: "after").count)")]
        case .concept:
            let cats = app.concepts.albumTiles.map(\.name).filter { $0 != FavoritesStore.albumName }
            return [("today", Copy.segToday)] + cats.map { ($0, Copy.category($0)) }
        case .snap:
            return []
        }
    }
    private var current: String { segment.isEmpty ? (segments.first?.key ?? "") : segment }

    private var items: [Concept] {
        switch purpose {
        case .profile: return app.studio.catalog?.looks(current) ?? []
        case .wedding:
            if current == "main" || current == "after" { return app.studio.dressList(kind: current).map(\.concept) }
            return app.concepts.concepts(for: .wedding)
        case .concept:
            return current == "today"
                ? Array(app.concepts.pool.filter { !$0.isFeature }.sorted(by: ConceptStore.byNewest).prefix(12))
                : app.concepts.concepts(in: current).sorted(by: ConceptStore.byNewest)
        case .snap: return app.concepts.concepts(for: .snap)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if segments.count > 1 {
                    ScrollView(.horizontal) {
                        HStack(spacing: Spacing.s2) {
                            ForEach(segments, id: \.key) { s in
                                OptionChip(title: s.title, isActive: current == s.key) { segment = s.key; HapticPlayer.selection() }
                            }
                        }
                        .padding(.horizontal, Spacing.page).padding(.vertical, Spacing.s2)
                    }
                    .scrollIndicators(.hidden)
                }
                tools
                DensePhotoGrid(concepts: items, category: segments.first { $0.key == current }?.title ?? purpose.title)
                    .id(purpose.rawValue + current)
                    .padding(.bottom, app.contentBottomPad)
            }
        }
        .background(Color.bg)
        .inlineTitle(purpose.title)
        .safeAreaInset(edge: .bottom) { CartBar() }
        .task { await app.studio.load() }
        .coachHost()
        .onAppear { app.enqueueCoach(Coach.grid) }
        .sheet(isPresented: $showKnobs) {
            DressFilterSheet(kind: current)
        }
        .sheet(isPresented: $pickGroom) {
            PhotoPicker(limit: 1, onPicked: { imgs in pickGroom = false; if let i = imgs.first { app.studio.groom = i } },
                        onCancel: { pickGroom = false }).ignoresSafeArea()
        }
    }

    /// 옵션 버튼 — 웨딩: 필터(드레스 탭) · 신랑도 함께.
    @ViewBuilder private var tools: some View {
        // 전문 프로필의 세부 조정·옷 바꾸기는 여기 없다 — "N장 만들기" 다음 단계(`StudioStepSheet`).
        if purpose == .wedding {
            let nf = app.studio.filter.values.reduce(0) { $0 + $1.count }
            toolRow {
                if current != "concepts" {
                    ToolButton(title: L.t("필터", "Filter") + (nf > 0 ? " · \(nf)" : ""), icon: "line.3.horizontal.decrease", on: nf > 0) { showKnobs = true }
                }
                ToolButton(title: app.studio.groom != nil ? L.t("신랑 사진 추가됨", "Groom added") : L.t("신랑도 함께", "With groom"), icon: "heart.circle", on: app.studio.groom != nil) {
                    if app.studio.groom != nil { app.studio.groom = nil } else { pickGroom = true }
                }
            }
        }
    }
    private func toolRow<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        HStack(spacing: Spacing.s2) { c() }.padding(.horizontal, Spacing.page).padding(.top, Spacing.s2).padding(.bottom, Spacing.s1)
    }
}

struct ToolButton: View {
    var title: String; var icon: String; var on: Bool; var action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) { Image(systemName: icon); Text(title).lineLimit(1) }
                .font(AppFont.bodyEmphasis).foregroundStyle(on ? Color.accent : Color.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // 리퀴드글래스(오너 지시 2026-10-09 "버튼 디자인 리퀴드글래스에 맞게") — 켜진 건 강조색으로 물든 유리.
        .glassEffect(on ? .regular.tint(Color.accent.opacity(0.22)).interactive() : .regular.interactive(), in: Capsule())
    }
}

/// 세부 조정 시트 — 항목·값은 서버 카탈로그가 정한다(브루클린 AdjustSheet 와 같은 구성).
struct KnobSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    var purpose: String
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s5) {
                    if app.studio.outfit[purpose] != nil {
                        Label(L.t("옷 사진이 의상을 정해요", "The outfit photo sets the clothes"), systemImage: "tshirt")
                            .font(AppFont.footnote).foregroundStyle(Color.ink2)
                    }
                    ForEach(app.studio.catalog?.purposeKnobs[purpose] ?? [], id: \.self) { knob in section(knob) }
                }
                .padding(.horizontal, Spacing.page).padding(.vertical, Spacing.s4)
            }
            .background(Color.bg)
            .navigationTitle(L.t("세부 조정", "Fine-tune")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button(L.t("기본값으로", "Reset")) { app.studio.overrides[purpose] = [:] } }
                ToolbarItem(placement: .topBarTrailing) { Button(Copy.close) { dismiss() }.fontWeight(.semibold) }
            }
        }
        .presentationDetents([.medium, .large])
    }
    private var dimmedKnobs: Set<String> { app.studio.outfit[purpose] != nil ? ["actorOutfits", "suits"] : [] }
    @ViewBuilder private func section(_ knob: String) -> some View {
        let key = StudioKnob.recipeKey[knob] ?? knob
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text(StudioKnob.title(knob, purpose: purpose)).font(AppFont.headline)
            if knob == "mono" {
                Toggle(L.t("흑백으로", "Black & white"), isOn: Binding(
                    get: { (app.studio.overrides[purpose]?[key] as? Bool) ?? false },
                    set: { v in set(key, v ? AnyHashable(true) : nil) })).tint(Color.accent)
            } else {
                let vals = (knob == "hair" ? [nil] : []) + (app.studio.catalog?.values(knob, purpose: purpose) ?? []).map { Optional($0) }
                FlowLayout(spacing: Spacing.s2) {
                    ForEach(Array(vals.enumerated()), id: \.offset) { _, v in
                        let cur = app.studio.overrides[purpose]?[key] as? String
                        let id = v.map { knob == "bgs" ? ($0.hex ?? $0.id) : $0.id }
                        let active = v == nil ? (cur == nil || cur == "") : cur == id
                        Button {
                            set(key, id.map(AnyHashable.init) ?? (knob == "hair" ? AnyHashable("") : nil)); HapticPlayer.selection()
                        } label: {
                            HStack(spacing: 6) {
                                if let sw = v?.swatch { Circle().fill(sw).frame(width: 14, height: 14).overlay(Circle().stroke(Color.separatorLine)) }
                                Text(v?.label ?? L.t("원본 유지", "Keep mine"))
                            }
                            .font(AppFont.callout).foregroundStyle(active ? Color.onInk : Color.ink)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(active ? Color.ink : Color.card, in: Capsule())
                            .overlay(Capsule().stroke(Color.separatorLine, lineWidth: active ? 0 : 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .opacity(dimmedKnobs.contains(knob) ? 0.4 : 1).disabled(dimmedKnobs.contains(knob))
    }
    private func set(_ key: String, _ v: AnyHashable?) {
        var o = app.studio.overrides[purpose] ?? [:]
        o[key] = v
        app.studio.overrides[purpose] = o
    }
}

/// 웨딩 드레스 필터 — 실루엣·컬러·넥라인·소매, 여러 개 골라 거른다(조세핀 디자인으로 보기).
struct DressFilterSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    var kind: String
    private let axes = [("sil", L.t("실루엣", "Silhouette")), ("col", L.t("컬러", "Color")), ("neck", L.t("넥라인", "Neckline")), ("slv", L.t("소매", "Sleeve"))]
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s5) {
                    ForEach(axes, id: \.0) { axis, title in
                        VStack(alignment: .leading, spacing: Spacing.s2) {
                            Text(title).font(AppFont.headline)
                            FlowLayout(spacing: Spacing.s2) {
                                ForEach(app.studio.axisValues(axis, kind: kind), id: \.self) { v in
                                    let on = app.studio.filter[axis]?.contains(v) ?? false
                                    Button {
                                        var s = app.studio.filter[axis] ?? []
                                        if on { s.remove(v) } else { s.insert(v) }
                                        app.studio.filter[axis] = s; HapticPlayer.selection()
                                    } label: {
                                        Text(v).font(AppFont.callout).foregroundStyle(on ? Color.onInk : Color.ink)
                                            .padding(.horizontal, 12).padding(.vertical, 8)
                                            .background(on ? Color.ink : Color.card, in: Capsule())
                                            .overlay(Capsule().stroke(Color.separatorLine, lineWidth: on ? 0 : 1))
                                    }.buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    Text(L.t("조건에 맞는 드레스 \(app.studio.dressList(kind: kind).count)벌", "\(app.studio.dressList(kind: kind).count) gowns match"))
                        .font(AppFont.footnote).foregroundStyle(Color.ink2).frame(maxWidth: .infinity)
                }
                .padding(.horizontal, Spacing.page).padding(.vertical, Spacing.s4)
            }
            .background(Color.bg)
            .navigationTitle(L.t("필터", "Filter")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button(L.t("기본값으로", "Reset")) { app.studio.filter = [:] } }
                ToolbarItem(placement: .topBarTrailing) { Button(Copy.close) { dismiss() }.fontWeight(.semibold) }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// 담은 사진 줄 — 썸네일(순서 번호·빼기) + "N장 만들기". 홈에서는 작은 배지로 접혀 있다가 누르면 펼친다.
struct CartBar: View {
    @Environment(AppState.self) private var app
    var compactOnHome = false

    var body: some View {
        if !app.cart.isEmpty {
            if compactOnHome && !app.cartExpanded { badge } else { bar }
        }
    }

    private var badge: some View {
        HStack {
            Spacer()
            Button { withAnimation(Motion.easeOut()) { app.cartExpanded = true } } label: {
                HStack(spacing: Spacing.s2) {
                    HStack(spacing: -10) {
                        ForEach(Array(app.cart.prefix(3)), id: \.id) { c in
                            RemoteImage(url: c.thumbURL, cornerRadius: 5).frame(width: 22, height: 28)
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color.ink, lineWidth: 2))
                        }
                    }
                    Text("\(app.cart.count)")
                        .font(AppFont.footnote.weight(.bold)).foregroundStyle(.white)
                        .frame(minWidth: 22, minHeight: 22).background(Color.accent, in: Capsule())
                }
                .padding(.leading, Spacing.s2).padding(.trailing, Spacing.s3).frame(height: 44)
                .background(Color.ink, in: Capsule())
                .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
            }
            .buttonStyle(PressScaleButtonStyle())
            .accessibilityLabel(Copy.a11yCart)
            .coachAnchor("cartBadge")
        }
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s2)
    }

    private var bar: some View {
        VStack(spacing: Spacing.s2) {
            if compactOnHome {
                Button { withAnimation(Motion.exitCurve()) { app.cartExpanded = false } } label: {
                    Capsule().fill(Color.ink3).frame(width: 36, height: 4).padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }
            ScrollView(.horizontal) {
                HStack(spacing: Spacing.s2) {
                    ForEach(Array(app.cart.enumerated()), id: \.element.id) { i, c in
                        RemoteImage(url: c.thumbURL, cornerRadius: 9)
                            .frame(width: 52, height: 68)
                            .overlay(alignment: .topLeading) {
                                Text("\(i + 1)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                                    .padding(.horizontal, 5).background(Color.accent, in: Capsule()).padding(4)
                            }
                            .overlay(alignment: .topTrailing) {
                                Button { withAnimation(Motion.exitCurve()) { app.removeFromCart(at: i) } } label: {
                                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.onInk)
                                        .frame(width: 20, height: 20).background(Color.ink, in: Circle())
                                }
                                .buttonStyle(.plain)
                                .offset(x: 6, y: -6)
                                .accessibilityLabel(Copy.a11yRemoveFromCart)
                            }
                    }
                }
                .padding(.horizontal, 2).padding(.top, 8)
            }
            .scrollIndicators(.hidden)
            HStack(spacing: Spacing.s3) {
                Text(Copy.cartCount(app.cart.count, AppState.cartMax))
                    .font(AppFont.footnote.weight(.bold)).foregroundStyle(Color.ink2).monospacedDigit()
                Button { app.generateCart() } label: { Text(Copy.cartMake(app.cart.count)) }
                    .buttonStyle(PrimaryButtonStyle())
                    .coachAnchor("cartMake")
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s2)
        .padding(.bottom, Spacing.s3)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Radius.sheet, style: .continuous))
        .padding(.horizontal, Spacing.s2)
        .padding(.bottom, Spacing.s1)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// 전문 프로필 탭(브루클린 목적). 탭 이름은 시제품 그대로(오너 확인).
enum StudioTab {
    static let all = ["resume", "linkedin", "audition"]
    static func title(_ k: String) -> String {
        switch k {
        case "resume": return L.t("이력서·취업", "Résumé")
        case "linkedin": return L.t("이직·비즈니스", "Business")
        default: return L.t("배우·모델", "Actor · model")
        }
    }
}

/// "N장 만들기" 다음 단계 — 담은 전문 프로필 룩을 탭별로 묶어 세부 조정·옷 바꾸기를 고른다.
/// 옵션은 그 탭에서 담은 룩에만 적용된다(`AppState.generateCart`).
struct StudioStepSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var knobTab: String?
    @State private var outfitTab: String?

    private var tabs: [String] { StudioTab.all.filter { t in app.cart.contains { $0.studioPurpose == t } } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s5) {
                    ForEach(tabs, id: \.self) { t in section(t) }
                }
                .padding(.horizontal, Spacing.page).padding(.vertical, Spacing.s4)
            }
            .background(Color.bg)
            .navigationTitle(Copy.purposeProfile).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(Copy.close) { dismiss() } } }
            .safeAreaInset(edge: .bottom) {
                Button {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { app.generateCart(optionsDone: true) }
                } label: { Text(Copy.cartMake(app.cart.count)) }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, Spacing.page).padding(.bottom, Spacing.s2)
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(item: Binding(get: { knobTab.map(StepTab.init) }, set: { knobTab = $0?.id })) { KnobSheet(purpose: $0.id) }
        .sheet(item: Binding(get: { outfitTab.map(StepTab.init) }, set: { outfitTab = $0?.id })) { t in
            PhotoPicker(limit: 1, onPicked: { imgs in
                outfitTab = nil
                if let i = imgs.first { app.studio.outfit[t.id] = i }
            }, onCancel: { outfitTab = nil }).ignoresSafeArea()
        }
    }

    private struct StepTab: Identifiable { let id: String }

    @ViewBuilder private func section(_ t: String) -> some View {
        let n = (app.studio.overrides[t] ?? [:]).count
        let hasOutfit = app.studio.outfit[t] != nil
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text(StudioTab.title(t)).font(AppFont.headline)
            ScrollView(.horizontal) {
                HStack(spacing: Spacing.s2) {
                    ForEach(app.cart.filter { $0.studioPurpose == t }) { c in
                        RemoteImage(url: c.thumbURL, cornerRadius: 9).frame(width: 52, height: 68)
                    }
                }
            }
            .scrollIndicators(.hidden)
            HStack(spacing: Spacing.s2) {
                ToolButton(title: L.t("세부 조정", "Fine-tune") + (n > 0 ? " · \(n)" : ""), icon: "slider.horizontal.3", on: n > 0) { knobTab = t }
                ToolButton(title: hasOutfit ? L.t("옷 사진 적용 중", "Outfit applied") : L.t("옷 바꾸기", "Change outfit"), icon: "tshirt", on: hasOutfit) {
                    if hasOutfit { app.studio.outfit[t] = nil } else { outfitTab = t }
                }
            }
        }
    }
}
