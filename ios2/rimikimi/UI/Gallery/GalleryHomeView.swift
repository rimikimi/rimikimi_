import SwiftUI

/// 갤러리(홈) — 로고 헤더(크레딧 칩 + 아바타) → 카테고리 칩 → 추천 줄 → 새로 나왔어요 줄 → 카테고리별 줄.
/// 홈은 로고가 제목이라 상단 바를 숨긴다. 칩을 고르면 줄 대신 그 카테고리 그리드.
struct GalleryHomeView: View {
    @Environment(AppState.self) private var app
    @State private var activeCategory: String?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    GalleryHeader()
                    if app.showInviteCard { InviteCard() }
                    CategoryChipsRow(categories: app.concepts.categories, active: $activeCategory)
                    if app.concepts.isLoading && app.concepts.concepts.isEmpty {
                        loadingRails
                    } else if let cat = activeCategory {
                        DensePhotoGrid(concepts: app.concepts.concepts(in: cat), category: cat)
                            .padding(.top, Spacing.s3)
                    } else {
                        ConceptRail(title: "추천", concepts: app.concepts.featured)
                        ConceptRail(title: "새로 나왔어요", concepts: app.concepts.newest, isNew: true)
                        BrooklynBanner()
                        // 그 외 카테고리는 가로 줄 대신 앨범 그리드(네이티브 사진 앱 참고,
                        // 오너 지시 2026-09-19) — "추천"·"새로 나왔어요"는 위에서 이미 뺐다.
                        AlbumsGrid(tiles: app.concepts.albumTiles)
                            .padding(.top, Spacing.s2)
                    }
                    Color.clear.frame(height: 1).id("bottomAnchor")
                }
                .padding(.bottom, app.contentBottomPad)
            }
            .scrollIndicators(.hidden)
            .background(Color.bg)
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await app.concepts.load() }
            #if DEBUG
            // 결함 #4 검증 캡처용 — `.defaultScrollAnchor` 는 "초기 위치" 힌트일 뿐이라 `concepts.load()`가
            // 늦게 끝나 콘텐츠가 나중에 자라면 이미 확정된 스크롤 위치가 진짜 바닥이 아니게 된다(실기기/기기별로
            // 로드 타이밍이 달라 재현됨 — SE 시뮬레이터에서 실제로 관측). 그래서 로딩이 완전히 끝난 뒤
            // 명시적으로 `bottomAnchor` 로 스크롤해 진짜 마지막 콘텐츠까지 확실히 캡처되게 한다.
            .onChange(of: app.concepts.isLoading) { _, loading in
                guard app.devScrollToBottom, !loading else { return }
                devRepeatScrollToBottom(proxy)
            }
            .onAppear {
                guard app.devScrollToBottom, !app.concepts.isLoading else { return }
                devRepeatScrollToBottom(proxy)
            }
            #endif
        }
    }

    #if DEBUG
    /// `LazyVStack` 은 화면 밖 줄의 실제 높이를 스크롤이 거기 닿기 전까진 모른다 — 맨 아래로 한 번에
    /// `scrollTo` 해도 그 시점엔 아직 계산 안 된 줄들이 있어 한 번으로는 진짜 끝까지 안 간다(SE 시뮬레이터
    /// 캡처에서 실제로 관측: 마지막 줄 다음 줄이 탭바 뒤로 살짝 비쳐 보임). 점점 늘어나는 지연으로 여러 번
    /// 다시 호출해 레이아웃이 수렴하게 한다.
    private func devRepeatScrollToBottom(_ proxy: ScrollViewProxy) {
        for delay in [0.2, 0.5, 0.9, 1.4] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                proxy.scrollTo("bottomAnchor", anchor: .bottom)
            }
        }
    }
    #endif

    private var loadingRails: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            ForEach(0..<2, id: \.self) { _ in
                SkeletonBlock().frame(height: 20).frame(width: 120).padding(.horizontal, Spacing.page).padding(.top, Spacing.s5)
                HStack(spacing: CardMetrics.railGap) {
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonBlock().frame(width: 160, height: 160 / CardMetrics.aspect + 40)
                    }
                }
                .padding(.horizontal, Spacing.page)
            }
        }
    }
}

/// 로고 헤더 — 워드마크 + 크레딧 칩 + 아바타. 유리 없음(스크롤 콘텐츠의 일부).
struct GalleryHeader: View {
    @Environment(AppState.self) private var app

    var body: some View {
        HStack(spacing: Spacing.s3) {
            BrandLogo(height: 24)
            Spacer()
            Button { app.tab = .profile } label: {
                // 로그인 직후엔 크레딧이 아직 안 와 있을 수 있다 — "–" 대신 로딩 중임이 보이는 스켈레톤.
                if app.auth.isSignedIn, app.quota == nil {
                    SkeletonBlock(cornerRadius: 15).frame(width: 52, height: 30)
                } else {
                    Text(app.auth.isSignedIn ? (app.quota?.chipLabel ?? "🎟 –") : "로그인")
                        .font(AppFont.footnote)
                        .foregroundStyle(Color.ink)
                        .padding(.horizontal, Spacing.s3)
                        .frame(height: 30)
                        .background(Color.fill, in: Capsule())
                }
            }
            .buttonStyle(PressScaleButtonStyle())
            .accessibilityLabel("크레딧")
            Button { app.tab = .profile } label: { Avatar(url: app.auth.session?.avatarURL, size: ControlHeight.avatar) }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityLabel("프로필")
        }
        .padding(.horizontal, Spacing.page)
        .padding(.top, Spacing.s2)
        .padding(.bottom, Spacing.s3)
    }
}

struct Avatar: View {
    var url: URL?
    var size: CGFloat
    var body: some View {
        ZStack {
            Circle().fill(Color.fill)
            if let url {
                AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }
            } else {
                Image(systemName: "person.fill").font(.system(size: size * 0.5)).foregroundStyle(Color.ink3)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

/// 카테고리 칩 줄 — "필터" 칩 없음. 활성 칩만 하트 4색(칩 순서대로).
struct CategoryChipsRow: View {
    var categories: [ConceptStore.Category]
    @Binding var active: String?

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Spacing.s2) {
                CategoryChip(title: "전체", isActive: active == nil, heartIndex: 0) { select(nil) }
                ForEach(Array(categories.enumerated()), id: \.element.id) { i, cat in
                    CategoryChip(title: cat.name, isActive: active == cat.name, heartIndex: i + 1) { select(cat.name) }
                }
            }
            .padding(.horizontal, Spacing.page)
        }
        .scrollIndicators(.hidden)
        .padding(.bottom, Spacing.s1)
    }

    private func select(_ name: String?) {
        guard active != name else { return }
        active = name
        HapticPlayer.selection()
    }
}

/// 증명사진 광고 배너 — rimikimi 는 화보/프로필 컨셉에 집중하고 증명사진은 전문앱 Brooklyn 으로
/// 유도한다(1.x `PortraitStudio.jsx` `openBrooklyn()`과 같은 목적: id/mode="idphoto" 컨셉은
/// `ConceptStore.pool` 에서 이미 제외돼 목록·카테고리에 안 뜨고, 이 배너로만 노출).
struct BrooklynBanner: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            Text("AD")
                .font(.system(size: 9, weight: .bold))
                .tracking(0.4)
                .foregroundStyle(Color.ink3)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 5, style: .continuous))

            Button { openURL(Config.brooklynAppStoreURL) } label: {
                HStack(spacing: Spacing.s3) {
                    Image("BrooklynIcon")
                        .resizable().scaledToFill()
                        .frame(width: 46, height: 46)
                        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("증명사진이 필요하다면, Brooklyn").font(AppFont.calloutEmphasis).foregroundStyle(Color.ink)
                        Text("여권·이력서·배우 프로필까지\n셀카 한 장이면 스튜디오급으로")
                            .font(AppFont.footnote).foregroundStyle(Color.ink2)
                    }
                    Spacer(minLength: 0)
                    Text("받기")
                        .font(AppFont.calloutEmphasis)
                        .foregroundStyle(Color.accent)
                }
                .padding(Spacing.s3)
                .frame(maxWidth: .infinity)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle())
        }
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s5)
    }
}

struct CategoryListView: View {
    @Environment(AppState.self) private var app
    @Environment(\.zoomNamespace) private var zoomNS
    var name: String
    var body: some View {
        ScrollView {
            DensePhotoGrid(concepts: app.concepts.concepts(in: name), category: name)
                .padding(.bottom, app.contentBottomPad)
        }
        .background(Color.bg)
        .inlineTitle(name)
        .toolbar {
            // 즐겨찾기 앨범 자체엔 별을 달지 않는다(자기 자신을 즐겨찾기 할 수 없다).
            if name != FavoritesStore.albumName {
                ToolbarItem(placement: .topBarTrailing) {
                    FavoriteToolbarButton(isOn: app.favorites.isFavorite(category: name)) {
                        app.favorites.toggle(category: name)
                    }
                }
            }
        }
    }
}
