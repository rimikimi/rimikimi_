import SwiftUI

/// 필터 카드 미리보기 — 평소엔 필터 결과(`ff_`)만. 카드가 **화면에 들어올 때 딱 한 번** 세로 선이 지나가며
/// 원본(`fo_`)을 보여 주고 다시 필터로 돌아온다(오너 2026-10-26 "1번"). 처음엔 보이는 카드를 한 장씩
/// 순서대로 돌렸는데 "필터가 40개"라 한 바퀴에 2분 — 대부분은 평생 못 본다 → 들어올 때 한 번으로.
/// 같이 들어온 카드들은 0.25초씩 어긋나게(물결) 지나가 한꺼번에 번쩍이지 않는다. 동작 줄이기면 정지.
struct FilterWipeCard: View {
    let key: String
    var cornerRadius: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
        .onAppear {
            guard !reduceMotion else { return }
            let delay = WipeStagger.nextDelay()
            // 오른쪽에서 왼쪽으로 원본이 드러나고(1.0초), 잠깐 멈춘 뒤 필터가 다시 덮는다(1.0초).
            withAnimation(.easeInOut(duration: 1.0).delay(delay)) { p = 0 }
            withAnimation(.easeInOut(duration: 1.0).delay(delay + 1.4)) { p = 1 }
        }
        .onDisappear { p = 1 }
    }
}

/// 같은 순간(0.6초 안)에 나타난 카드들에게 0.25초씩 늦은 출발을 나눠 준다 — 첫 화면은 0.5초 뒤부터.
@MainActor enum WipeStagger {
    private static var last = Date.distantPast
    private static var n = 0
    static func nextDelay() -> Double {
        let now = Date()
        if now.timeIntervalSince(last) > 0.6 { n = 0 }
        last = now
        defer { n += 1 }
        return 0.5 + Double(n) * 0.25
    }
}
