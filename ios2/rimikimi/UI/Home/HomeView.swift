import SwiftUI

/// 만들기 탭(홈) — 2026-10-09 개편(오너 지시, `docs/ux-v3` C안 시제품).
/// 로고 · 크레딧 · ⚙︎ → "말로 고치기 / 옛날 사진 복원" 카드 → 목적 4칸 → 컨셉 앨범 3열.
/// 설명 글은 넣지 않는다(오너: "앱 안에 텍스트가 불필요하게 많으면 복잡해 보임").
struct HomeView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                HomeHeader()
                FeatureCards().coachAnchor("cards")
                PurposeGrid().coachAnchor("purposes")
                if app.concepts.isLoading && app.concepts.concepts.isEmpty {
                    SkeletonBlock().frame(height: 220).padding(.horizontal, Spacing.page)
                } else {
                    AlbumsGrid(tiles: app.concepts.albumTiles)
                }
            }
            .padding(.bottom, app.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await app.concepts.load() }
        .safeAreaInset(edge: .bottom) { CartBar(compactOnHome: true) }
        .coachHost()
        .onAppear {
            app.startHomeCoach()
            if !app.cart.isEmpty { app.enqueueCoach(Coach.badge) }
        }
    }
}

/// 로고 + 크레딧 칩 + ⚙︎ 설정(예전 프로필 탭).
struct HomeHeader: View {
    @Environment(AppState.self) private var app
    var body: some View {
        HStack(spacing: Spacing.s3) {
            BrandLogo(height: 24)
            Spacer()
            Button { app.pushRoute(.settings) } label: {
                if app.auth.isSignedIn, app.quota == nil {
                    SkeletonBlock(cornerRadius: 15).frame(width: 52, height: 30)
                } else {
                    Text(app.auth.isSignedIn ? (app.quota?.chipLabel ?? "🎟 –") : Copy.signIn)
                        .font(AppFont.footnote).foregroundStyle(Color.ink)
                        .padding(.horizontal, Spacing.s3).frame(height: 30)
                        .background(Color.fill, in: Capsule())
                }
            }
            .buttonStyle(PressScaleButtonStyle())
            .accessibilityLabel(Copy.creditsLabel)
            Button { app.pushRoute(.settings) } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Color.ink)
                    .frame(width: 36, height: 36)
                    .background(Color.card, in: Circle())
                    .overlay(Circle().stroke(Color.separatorLine, lineWidth: 1))
            }
            .buttonStyle(PressScaleButtonStyle())
            .accessibilityLabel(Copy.settingsTitle)
        }
        .padding(.horizontal, Spacing.page)
        .padding(.top, Spacing.s2)
    }
}

/// 대표 기능 2개 — 지금 있는 컨셉(말로 고치기 = mode retouch, 복원 = 408)을 그대로 연다.
struct FeatureCards: View {
    @Environment(AppState.self) private var app
    private var retouch: Concept? { app.concepts.concepts.first { $0.isRetouch } }
    private var restore: Concept? { app.concepts.concept(id: "408") ?? app.concepts.concepts.first { $0.title.contains("복원") } }

    var body: some View {
        HStack(spacing: Spacing.s3) {
            card(Copy.featureRetouch, "pencil.line", Color.accentTint, retouch)
            card(Copy.featureRestore, "clock.arrow.circlepath", Color.fill, restore)
        }
        .padding(.horizontal, Spacing.page)
    }

    private func card(_ title: String, _ icon: String, _ bg: Color, _ c: Concept?) -> some View {
        Button { if let c { app.pushRoute(.concept(c)) } } label: {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Image(systemName: icon).font(.system(size: 20, weight: .medium))
                Text(title).font(AppFont.bodyEmphasis)
            }
            .foregroundStyle(Color.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.s4)
            .background(bg, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
        .disabled(c == nil)
    }
}

/// 목적 4칸.
enum Purpose: String, CaseIterable {
    case profile, snap, wedding, concept
    var title: String {
        switch self {
        case .profile: return Copy.purposeProfile
        case .snap: return Copy.purposeSnap
        case .wedding: return Copy.purposeWedding
        case .concept: return Copy.purposeConcept
        }
    }
    /// 서버 데이터에 `purposes` 가 아직 없을 때 쓰는 카테고리(빌드 없이 데이터로 갈아끼운다).
    var fallbackCategory: String? {
        switch self {
        case .profile: return "스튜디오 프로필"
        case .snap: return "일상 스냅"
        case .wedding: return "웨딩 / 브라이덜"
        case .concept: return nil
        }
    }
    /// 표지 컨셉(오너 지정: 프사·소개팅 = 454 한옥카페 빙수).
    var coverID: String? {
        switch self {
        case .snap: return "454"
        default: return nil
        }
    }
}

extension ConceptStore {
    /// 목적에 들어가는 컨셉 — 서버가 `purposes` 로 정한 것, 없으면 대체 카테고리.
    func concepts(for p: Purpose) -> [Concept] {
        let tagged = pool.filter { $0.purposes.contains(p.rawValue) }.sorted(by: Self.byNewest)
        if !tagged.isEmpty { return tagged }
        if let cat = p.fallbackCategory { return concepts(in: cat).sorted(by: Self.byNewest) }
        return newest
    }
    func cover(for p: Purpose) -> Concept? {
        if let id = p.coverID, let c = concept(id: id) { return c }
        return p == .concept ? newest.first : concepts(for: p).first
    }
}

struct PurposeGrid: View {
    @Environment(AppState.self) private var app
    private let columns = [GridItem(.flexible(), spacing: Spacing.s3), GridItem(.flexible(), spacing: Spacing.s3)]
    var body: some View {
        LazyVGrid(columns: columns, spacing: Spacing.s3) {
            ForEach(Purpose.allCases, id: \.self) { p in
                // 네 번째 칸은 컨셉화보 대신 드레스룸(오너 2026-10-10) — 누르면 드레스룸 컨셉 화면으로 바로.
                // 드레스룸 컨셉이 아직 안 불러와졌으면 예전처럼 컨셉화보 목적 화면.
                let dress = p == .concept ? app.concepts.concepts.first(where: { $0.isDressroom }) : nil
                Button {
                    if let dress { app.pushRoute(.concept(dress)) } else { app.pushRoute(.purpose(p.rawValue)) }
                } label: {
                    HStack(spacing: Spacing.s3) {
                        RemoteImage(url: (dress ?? app.concepts.cover(for: p))?.thumbURL, cornerRadius: 8)
                            .frame(width: 38, height: 48)
                        Text(dress != nil ? Copy.purposeDressroom : p.title).font(AppFont.bodyEmphasis).foregroundStyle(Color.ink)
                            .lineLimit(1).minimumScaleFactor(0.85)
                        Spacer(minLength: 0)
                    }
                    .padding(Spacing.s3)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).stroke(Color.separatorLine, lineWidth: 1))
                }
                .buttonStyle(PressScaleButtonStyle())
            }
        }
        .padding(.horizontal, Spacing.page)
    }
}
