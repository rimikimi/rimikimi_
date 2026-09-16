import SwiftUI

/// 갤러리(홈) — 로고 헤더(크레딧 칩 + 아바타) → 카테고리 칩 → 추천 줄 → 새로 나왔어요 줄 → 카테고리별 줄.
/// 홈은 로고가 제목이라 상단 바를 숨긴다. 칩을 고르면 줄 대신 그 카테고리 그리드.
struct GalleryHomeView: View {
    @Environment(AppState.self) private var app
    @State private var activeCategory: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                GalleryHeader()
                if app.showInviteCard { InviteCard() }
                CategoryChipsRow(categories: app.concepts.categories, active: $activeCategory)
                if app.concepts.isLoading && app.concepts.concepts.isEmpty {
                    loadingRails
                } else if let cat = activeCategory {
                    ConceptGrid(concepts: app.concepts.concepts(in: cat))
                        .padding(.top, Spacing.s3)
                } else {
                    ConceptRail(title: "추천", concepts: app.concepts.featured)
                    ConceptRail(title: "새로 나왔어요", concepts: app.concepts.newest, isNew: true)
                    ForEach(app.concepts.rows) { row in
                        ConceptRail(title: row.name, concepts: row.items, more: Route.category(row.name))
                    }
                }
            }
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await app.concepts.load() }
    }

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

struct CategoryListView: View {
    @Environment(AppState.self) private var app
    var name: String
    var body: some View {
        ScrollView {
            ConceptGrid(concepts: app.concepts.concepts(in: name))
                .padding(.top, Spacing.s3)
                .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .background(Color.bg)
        .inlineTitle(name)
    }
}
