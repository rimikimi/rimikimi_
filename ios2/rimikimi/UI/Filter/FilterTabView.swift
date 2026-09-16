import SwiftUI

/// 필터 탭 — 맨 위 "카메라로 찍기", 필름 · 카메라 · 재미 세 그룹 가로줄.
/// 프리셋 이름은 `src/filters.js` FILM_PRESETS(ko). 편집기는 1단계 웹뷰(SPEC §5).
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Button { app.requireLogin(.camera) } label: {
                    HStack(spacing: Spacing.s3) {
                        Image(systemName: "camera.fill").font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(Color.onInk).frame(width: 44, height: 44).background(Color.ink, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("카메라로 찍기").font(AppFont.headline)
                            Text("필터를 보면서 찍어요 · 전부 무료").font(AppFont.footnote).foregroundStyle(Color.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink3)
                    }
                    .padding(Spacing.s4)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.985))
                .padding(.horizontal, Spacing.page)
                .padding(.top, Spacing.s2)

                Text("필터를 고르고 사진을 올리면 끝 · 한 번에 10장까지 · 전부 무료")
                    .font(AppFont.footnote).foregroundStyle(Color.ink2)
                    .padding(.horizontal, Spacing.page).padding(.top, Spacing.s3)

                ForEach(Self.groups) { g in
                    SectionHeader(title: "\(g.emoji) \(g.title)")
                    ScrollView(.horizontal) {
                        HStack(spacing: Spacing.s3) {
                            ForEach(g.presets) { p in
                                Button { app.requireLogin(.filterPick) } label: {
                                    VStack(spacing: Spacing.s2) {
                                        RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                                            .fill(Color.fill)
                                            .frame(width: 96, height: 128)
                                            .overlay { Image(systemName: "photo").font(.system(size: 22)).foregroundStyle(Color.ink3) }
                                        Text(p.label).font(AppFont.footnote).foregroundStyle(Color.ink)
                                    }
                                }
                                .buttonStyle(PressScaleButtonStyle())
                            }
                        }
                        .padding(.horizontal, Spacing.page)
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle("필터")
    }
}
