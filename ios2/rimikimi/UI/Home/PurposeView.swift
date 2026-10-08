import SwiftUI

/// 목적 화면 — 위에 탭(컨셉화보만 카테고리 여러 개), 아래 3열 격자(핀치 5열, 지금 카테고리 화면과 같은 격자).
/// 칸을 누르면 담기, 길게 누르면 크게 보기·즐겨찾기. 담은 건 아래 줄에 모인다.
struct PurposeView: View {
    @Environment(AppState.self) private var app
    var key: String
    @State private var segment: String = ""

    private var purpose: Purpose { Purpose(rawValue: key) ?? .concept }

    /// 컨셉화보: "오늘의 새 컨셉" + 카테고리. 나머지 목적은 탭이 하나라 숨긴다.
    private var segments: [(key: String, title: String)] {
        guard purpose == .concept else { return [] }
        let cats = app.concepts.albumTiles.map(\.name).filter { $0 != FavoritesStore.albumName }
        return [("today", Copy.segToday)] + cats.map { ($0, Copy.category($0)) }
    }

    private var items: [Concept] {
        guard purpose == .concept else { return app.concepts.concepts(for: purpose) }
        let seg = segment.isEmpty ? "today" : segment
        return seg == "today" ? app.concepts.newest : app.concepts.concepts(in: seg).sorted(by: ConceptStore.byNewest)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if !segments.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: Spacing.s2) {
                            ForEach(segments, id: \.key) { s in
                                OptionChip(title: s.title, isActive: (segment.isEmpty ? "today" : segment) == s.key) {
                                    segment = s.key
                                    HapticPlayer.selection()
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.page)
                        .padding(.vertical, Spacing.s2)
                    }
                    .scrollIndicators(.hidden)
                }
                DensePhotoGrid(concepts: items, category: segment.isEmpty ? purpose.title : segment)
                    .id(segment)
                    .padding(.bottom, app.contentBottomPad)
            }
        }
        .background(Color.bg)
        .inlineTitle(purpose.title)
        .safeAreaInset(edge: .bottom) { CartBar() }
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
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s2)
        .padding(.bottom, Spacing.s3)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sheet, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 16, y: -4)
        .padding(.horizontal, Spacing.s2)
        .padding(.bottom, Spacing.s1)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
