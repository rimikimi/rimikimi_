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
         CoachStep(key: "cameraTab", title: L.t("카메라", "Camera"), text: L.t("필터를 입혀서 바로 찍어요. 앨범 사진엔 옆 '필터' 탭에서. 무료예요.", "Shoot with live filters. For album photos, use the Filters tab next to it. Free."))]
    }
    static let grid = CoachStep(key: "firstTile", title: L.t("여러 개 담기", "Pick several"), text: L.t("길게 누르면 아래에 담겨요. 다른 카테고리와 섞어서 한 번에 8장까지. 탭하면 크게 보기.", "Press and hold to pick. Mix categories, up to 8 at once. Tap to view."))
    static let cart = CoachStep(key: "cartMake", title: L.t("한 번에 만들기", "Make them at once"), text: L.t("담은 건 여기 모여요. 다 골랐으면 누르고 셀카 한 장이면 끝.", "Your picks gather here. Tap and add one selfie."))
    static let badge = CoachStep(key: "cartBadge", title: L.t("담은 것", "Your picks"), text: L.t("다른 화면에 가도 그대로 있어요. 여기를 누르면 다시 열려요.", "They stay while you browse. Tap to open."))

    static let filter = CoachStep(key: "filterStrip", title: L.t("필터 즐겨찾기", "Favorite filters"), text: L.t("필터를 길게 누르면 즐겨찾기에 들어가서 맨 앞에 모여요.", "Press and hold a filter to favorite it — favorites come first."))
    static func seen(_ key: String) -> Bool { UserDefaults.standard.bool(forKey: "coach.\(key)") }
    static func markSeen(_ key: String) { UserDefaults.standard.set(true, forKey: "coach.\(key)") }
}

/// 튜토리얼이 가리킬 자리들 — 창(window) 기준 좌표.
/// ⚠️ 예전엔 anchorPreference + overlayPreferenceValue 의 GeometryReader 로 풀었는데, iOS 27 에서 그 GeometryReader 가
///    엉뚱하게 작게 잡혀 막·구멍·카드가 전부 틀어지고 화면 터치만 막혔다(애플 2.1(a) 반려 2026-10-24 "만들기 화면 버튼이 하나도 안 눌림").
///    → 각 자리가 자기 창 좌표를 직접 알리고, 오버레이는 창 크기로 그린다.
@Observable final class CoachRects {
    static let shared = CoachRects()
    var rects: [String: CGRect] = [:]
}

extension View {
    /// 튜토리얼이 가리킬 수 있는 자리.
    func coachAnchor(_ key: String) -> some View {
        onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { CoachRects.shared.rects[key] = $0 }
    }
    /// 이 화면에서 `app.coachQueue` 의 첫 단계를 그린다. 자리가 이 화면에 없으면 그리지 않는다
    /// (`cameraTab` 은 탭바라 자리 대신 화면 아래 가운데를 쓴다).
    func coachHost() -> some View { modifier(CoachHost()) }
}

private struct CoachHost: ViewModifier {
    @Environment(AppState.self) private var app
    func body(content: Content) -> some View {
        content.overlay {
            let full = Self.windowSize
            if let step = app.coachQueue.first, let rect = rect(step.key, full), rect.width > 1, rect.height > 1 {
                CoachOverlay(step: step, hole: rect, size: full,
                             index: app.coachIndex, total: app.coachTotal) { app.advanceCoach() } skip: { app.skipCoach() }
                    .frame(width: full.width, height: full.height)
                    .ignoresSafeArea()
            }
        }
        #if DEBUG
        // 검증용: -dev.coachStep N → 튜토리얼을 N 단계 자동으로 넘긴다(시뮬레이터엔 탭을 못 보내서)
        .task {
            let n = UserDefaults.standard.integer(forKey: "dev.coachStep")
            guard n > 0 else { return }
            try? await Task.sleep(for: .seconds(4))
            for _ in 0..<n { app.advanceCoach(); try? await Task.sleep(for: .seconds(1)) }
        }
        #endif
    }
    private func rect(_ key: String, _ full: CGSize) -> CGRect? {
        if let r = CoachRects.shared.rects[key] { return r }
        if key == "cameraTab" {
            let w = full.width / 5   // 탭 5개(만들기·매직 부스·카메라·필터·내 사진) 중 세 번째
            let bottomInset = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.keyWindow?.safeAreaInsets.bottom ?? 34
            return CGRect(x: w * 2 + 4, y: full.height - bottomInset - 44, width: w - 8, height: 60)   // 탭바(하단 고정, 막 위에 그려짐) 뒤에 숨는 자리 — 막 구멍이 탭바 위로 삐져나오지 않게(10/24 실측)
        }
        return nil
    }
    /// 앱 창 크기(아이패드 호환 창 포함).
    static var windowSize: CGSize {
        (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.keyWindow?.bounds.size ?? UIScreen.main.bounds.size
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
    @State private var bubbleH: CGFloat = 160
    /// 기기 아래 안전영역(홈 인디케이터) — 오버레이가 안전영역을 무시해서 직접 읽는다.
    private var safeBottom: CGFloat {
        (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.keyWindow?.safeAreaInsets.bottom ?? 34
    }
    private var safeTop: CGFloat {
        (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.keyWindow?.safeAreaInsets.top ?? 47
    }
    var body: some View {
        let h = hole.insetBy(dx: -6, dy: -6)
        // 카드는 아래 메뉴(탭바 ~70pt)와 홈 인디케이터 위, 상단 안전영역 아래에 가둔다 — 자리가 화면 밖이어도
        // 카드는 항상 보이게(오너 2026-10-15, 갤럭시에서 카드가 메뉴에 가림 — iOS 도 같은 계산이었다).
        let bottomLimit = size.height - safeBottom - 82
        let bubbleBelow = h.maxY + 12 + bubbleH <= bottomLimit
        let wantY = bubbleBelow ? h.maxY + 12 : h.minY - 12 - bubbleH
        let bubbleY = min(max(safeTop + 8, wantY), bottomLimit - bubbleH)
        // ⚠️ iOS 27 에서 짝홀 채우기 Path + offset 카드가 엉뚱하게 그려졌다(어두운 막은 왼쪽 위 회색 상자만, 카드는 안 보이는데
        //    탭은 화면 전체가 막혀 '만들기 화면 버튼이 하나도 안 눌림' — 애플 2.1(a) 반려 2026-10-24, 시뮬레이터 iOS 27 재현).
        //    → 막은 마스크로 구멍 내고, 카드는 position 으로 화면 좌표에 직접 놓는다. 크기는 전부 화면 크기로 고정.
        let cardW = max(0, size.width - Spacing.page * 2)
        ZStack {
            Rectangle()
                .fill(Color.black.opacity(0.62))
                .mask {
                    Rectangle()
                        .overlay {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .frame(width: h.width, height: h.height)
                                .position(x: h.midX, y: h.midY)
                                .blendMode(.destinationOut)
                        }
                        .compositingGroup()
                }
                .frame(width: size.width, height: size.height)
                .contentShape(Rectangle())
                // 뒤는 못 누르게 하되, 어두운 곳을 누르면 다음으로 — 카드가 어떤 이유로든 안 보여도 갇히지 않게
                .onTapGesture { next() }
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
            .frame(width: cardW, alignment: .leading)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sheet, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 20, y: 8)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bubbleH = $0 }
            .position(x: size.width / 2, y: bubbleY + bubbleH / 2)
        }
        .frame(width: size.width, height: size.height)
        .animation(.easeOut(duration: 0.25), value: step)
    }
}
