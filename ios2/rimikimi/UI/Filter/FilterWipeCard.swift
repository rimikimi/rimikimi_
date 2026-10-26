import SwiftUI

/// 필터 카드 미리보기 — 평소엔 필터 결과(`ff_`)만. 화면에 보이는 카드 중 **한 장씩 차례로** 세로 선이
/// 지나가며 원본(`fo_`)을 보여 주고 다시 필터로 돌아온다(오너 2026-10-26 "1번", "40개가 다 움직이면
/// 정신없다" → 한 번에 한 장). 동작 줄이기가 켜져 있으면 움직이지 않는다.
struct FilterWipeCard: View {
    let key: String
    var cornerRadius: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var id = UUID()
    /// 1 = 전부 필터, 0 = 전부 원본. 선은 `p` 자리.
    @State private var p: CGFloat = 1

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                RemoteImage(url: Config.thumbURL("fo_\(key)"), cornerRadius: 0, fallback: Config.thumbURL("ff_\(key)"))
                RemoteImage(url: Config.thumbURL("ff_\(key)"), cornerRadius: 0, fallback: Config.thumbURL("fs_\(key)"))
                    .mask(alignment: .leading) { Rectangle().frame(width: w * p) }
                Rectangle().fill(.white.opacity(0.95)).frame(width: 2)
                    .shadow(color: .black.opacity(0.35), radius: 2)
                    .offset(x: w * p - 1)
                    .opacity(p < 0.999 ? 1 : 0)
            }
            .frame(width: w, height: geo.size.height)
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .onAppear { if !reduceMotion { WipeConductor.shared.appear(id) } }
        .onDisappear { WipeConductor.shared.disappear(id); p = 1 }
        .onChange(of: WipeConductor.shared.active == id) { _, on in
            guard on, !reduceMotion else { return }
            // 오른쪽에서 왼쪽으로 원본이 드러나고(1.1초), 잠깐 멈춘 뒤 필터가 다시 덮는다(1.1초).
            withAnimation(.easeInOut(duration: 1.1)) { p = 0 }
            withAnimation(.easeInOut(duration: 1.1).delay(1.6)) { p = 1 }
        }
    }
}

/// 보이는 카드들을 순서대로 한 장씩 깨운다 — 한 장 2.7초 + 쉬는 0.5초.
@MainActor @Observable final class WipeConductor {
    static let shared = WipeConductor()
    private(set) var active: UUID?
    private var visible: [UUID] = []
    private var runner: Task<Void, Never>?

    func appear(_ id: UUID) {
        if !visible.contains(id) { visible.append(id) }
        guard runner == nil else { return }
        runner = Task { [weak self] in
            var i = 0
            // 첫 카드는 조금 기다렸다가(화면이 자리 잡은 뒤) 시작한다.
            try? await Task.sleep(for: .seconds(1.2))
            while !Task.isCancelled, let self, !self.visible.isEmpty {
                i = (i + 1) % max(self.visible.count, 1)
                self.active = self.visible[i]
                try? await Task.sleep(for: .seconds(2.7))
                self.active = nil
                try? await Task.sleep(for: .seconds(0.5))
            }
            self?.runner = nil
        }
    }

    func disappear(_ id: UUID) {
        visible.removeAll { $0 == id }
        if active == id { active = nil }
        if visible.isEmpty { runner?.cancel(); runner = nil }
    }
}
