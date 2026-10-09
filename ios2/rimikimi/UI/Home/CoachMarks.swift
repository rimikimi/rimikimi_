import SwiftUI

/// 튜토리얼(코치마크) — 화면을 어둡게 하고 설명할 곳만 밝게(시제품 C안과 같다, 오너 지시 2026-10-09 "tutorial 당연히").
/// 첫 실행: 홈 4단계(고치기 카드 → 목적 → 앨범 → 카메라 탭). 그 밖은 그 기능을 처음 쓸 때 한 번씩.
struct CoachStep: Equatable {
    let key: String
    let title: String
    let text: String
}

enum Coach {
    static func home() -> [CoachStep] {
        [CoachStep(key: "cards", title: L.t("내 사진 고치기", "Fix your photos"), text: L.t("말로 적으면 그 부분만 고치고, 옛날 사진은 선명하게 되살려요.", "Describe a fix and only that part changes. Old photos come back sharp.")),
         CoachStep(key: "purposes", title: L.t("목적 고르기", "Pick a purpose"), text: L.t("이력서·프사·웨딩·화보 중 고르면 거기에 맞는 룩이 나와요.", "Résumé, profile, wedding or concept — looks that fit appear.")),
         CoachStep(key: "albums", title: L.t("컨셉 앨범", "Concept albums"), text: L.t("카테고리별로 모아 뒀어요. 앨범을 열어 둘러봐요.", "Grouped by category. Open one to browse.")),
         CoachStep(key: "cameraTab", title: L.t("카메라·필터", "Camera"), text: L.t("찍고 필터를 입히는 건 여기서. 무료예요.", "Shoot and add filters here. Free."))]
    }
    static let grid = CoachStep(key: "firstTile", title: L.t("여러 개 담기", "Pick several"), text: L.t("길게 누르면 아래에 담겨요. 다른 카테고리와 섞어서 한 번에 8장까지. 탭하면 크게 보기.", "Press and hold to pick. Mix categories, up to 8 at once. Tap to view."))
    static let cart = CoachStep(key: "cartMake", title: L.t("한 번에 만들기", "Make them at once"), text: L.t("담은 건 여기 모여요. 다 골랐으면 누르고 셀카 한 장이면 끝.", "Your picks gather here. Tap and add one selfie."))
    static let badge = CoachStep(key: "cartBadge", title: L.t("담은 것", "Your picks"), text: L.t("다른 화면에 가도 그대로 있어요. 여기를 누르면 다시 열려요.", "They stay while you browse. Tap to open."))

    static let filter = CoachStep(key: "filterStrip", title: L.t("필터 즐겨찾기", "Favorite filters"), text: L.t("필터를 길게 누르면 즐겨찾기에 들어가서 맨 앞에 모여요.", "Press and hold a filter to favorite it — favorites come first."))
    static func seen(_ key: String) -> Bool { UserDefaults.standard.bool(forKey: "coach.\(key)") }
    static func markSeen(_ key: String) { UserDefaults.standard.set(true, forKey: "coach.\(key)") }
}

struct CoachAnchorKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] = [:]
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

extension View {
    /// 튜토리얼이 가리킬 수 있는 자리.
    func coachAnchor(_ key: String) -> some View {
        anchorPreference(key: CoachAnchorKey.self, value: .bounds) { [key: $0] }
    }
    /// 이 화면에서 `app.coachQueue` 의 첫 단계를 그린다. 자리가 이 화면에 없으면 그리지 않는다
    /// (`cameraTab` 은 탭바라 자리 대신 화면 아래 가운데를 쓴다).
    func coachHost() -> some View { modifier(CoachHost()) }
}

private struct CoachHost: ViewModifier {
    @Environment(AppState.self) private var app
    func body(content: Content) -> some View {
        content.overlayPreferenceValue(CoachAnchorKey.self) { anchors in
            GeometryReader { geo in
                if let step = app.coachQueue.first, let rect = rect(step.key, anchors, geo) {
                    CoachOverlay(step: step, hole: rect, size: geo.size,
                                 index: app.coachIndex, total: app.coachTotal) { app.advanceCoach() } skip: { app.skipCoach() }
                }
            }
            .ignoresSafeArea()
        }
    }
    private func rect(_ key: String, _ anchors: [String: Anchor<CGRect>], _ geo: GeometryProxy) -> CGRect? {
        if let a = anchors[key] { return geo[a] }
        if key == "cameraTab" {
            let w = geo.size.width / 3
            return CGRect(x: w + 8, y: geo.size.height - geo.safeAreaInsets.bottom - 70, width: w - 16, height: 62)
        }
        return nil
    }
}

private struct CoachOverlay: View {
    var step: CoachStep
    var hole: CGRect
    var size: CGSize
    var index: Int
    var total: Int
    var next: () -> Void
    var skip: () -> Void
    var body: some View {
        let h = hole.insetBy(dx: -6, dy: -6)
        let bubbleBelow = h.maxY + 170 < size.height
        ZStack(alignment: .topLeading) {
            // 화면 전체에서 설명할 자리만 뚫는다(짝홀 채우기 — 마스크 합성보다 확실하다).
            Path { p in
                p.addRect(CGRect(origin: .zero, size: size))
                p.addRoundedRect(in: h, cornerSize: CGSize(width: 16, height: 16))
            }
            .fill(Color.black.opacity(0.62), style: FillStyle(eoFill: true))
            .contentShape(Rectangle())
            .onTapGesture { }  // 뒤를 못 누르게
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text(step.title).font(AppFont.headline).foregroundStyle(Color.ink)
                Text(step.text).font(AppFont.callout).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                HStack {
                    if total > 1 { Button(L.t("건너뛰기", "Skip"), action: skip).foregroundStyle(Color.ink2) }
                    Spacer()
                    if total > 1 { Text("\(index + 1)/\(total)").font(AppFont.footnote).foregroundStyle(Color.ink3).monospacedDigit() }
                    Spacer()
                    Button(action: next) {
                        Text(total <= 1 ? L.t("알겠어요", "Got it") : index + 1 == total ? L.t("시작하기", "Start") : L.t("다음", "Next"))
                            .font(AppFont.bodyEmphasis).foregroundStyle(.white)
                            .padding(.horizontal, 16).padding(.vertical, 9).background(Color.accent, in: Capsule())
                    }
                }
                .font(AppFont.bodyEmphasis)
            }
            .padding(Spacing.s4)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sheet, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 20, y: 8)
            .padding(.horizontal, Spacing.page)
            .offset(y: bubbleBelow ? h.maxY + 12 : max(40, h.minY - 160))
        }
        .animation(.easeOut(duration: 0.25), value: step)
    }
}
