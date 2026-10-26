import SwiftUI

/// 필터 카드 — 앞면은 원본(`fo_`). 탭하면 카드가 180° 뒤집혀 뒷면에 **필터 적용본(`ff_`) + 적용하기 버튼**
/// (오너: "뒷면이 필터 적용본이어야지").
/// (오너 2026-10-26: 자동으로 움직이는 비교는 전부 "정신없다" → 건드린 카드만, 탭으로 뒤집기.)
/// 뒷면 사진을 탭하면 다시 앞면. 동작 줄이기면 회전 없이 바로 바뀐다.
struct FilterFlipCard: View {
    let key: String
    @Binding var favs: [String]
    var app: AppState
    var captionSize: CGFloat? = 16          // nil 이면 이름 띠 없음(격자는 아래 글자로)
    var cornerRadius: CGFloat = Radius.card
    var starSize: CGFloat = 32
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    #if DEBUG
    @State private var flipped = UserDefaults.standard.bool(forKey: "dev.flipAll")   // 캡처용: 뒷면부터
    #else
    @State private var flipped = false
    #endif

    var body: some View {
        ZStack {
            front.opacity(flipped ? 0 : 1)
            back.opacity(flipped ? 1 : 0)
                .rotation3DEffect(.degrees(reduceMotion ? 0 : 180), axis: (x: 0, y: 1, z: 0))
        }
        .rotation3DEffect(.degrees(!reduceMotion && flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.55, bounce: 0.12), value: flipped)
        .onDisappear { flipped = false }
        #if DEBUG
        .task {
            // 캡처용: -dev.flipDemo <key> → 그 카드가 1.5초 뒤 뒤집히고 3초 뒤 돌아온다(시뮬레이터엔 탭을 못 보낸다).
            guard UserDefaults.standard.string(forKey: "dev.flipDemo") == key else { return }
            try? await Task.sleep(for: .seconds(1.5)); flipped = true
            try? await Task.sleep(for: .seconds(3)); flipped = false
        }
        #endif
    }

    private var front: some View {
        RemoteImage(url: Config.thumbURL("fo_\(key)"), cornerRadius: 0, fallback: Config.thumbURL("ff_\(key)"))
            .photoRatio()
            .overlay(alignment: .bottomLeading) { if let captionSize { PhotoCaption(title: Copy.filterName(key), size: captionSize) } }
            .overlay(alignment: .topTrailing) { FilterFavorites.starButton(key, favs: $favs, app: app, size: starSize) }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .onTapGesture { flipped = true; HapticPlayer.selection() }
            .accessibilityLabel(Copy.filterName(key))
            .accessibilityHint(L.t("누르면 필터 적용본과 적용하기", "Tap to see the filter and Apply"))
    }

    private var back: some View {
        RemoteImage(url: Config.thumbURL("ff_\(key)"), cornerRadius: 0, fallback: Config.thumbURL("fs_\(key)"))
            .photoRatio()
            .contentShape(Rectangle())
            .onTapGesture { flipped = false }
            .overlay(alignment: .top) {
                // 색을 고정(다크에선 Color.ink 가 흰색이라 흰 알약 위에서 안 보였다 — 실측).
                Text(Copy.filterName(key))
                    .font(AppFont.caption).foregroundStyle(.black)
                    .padding(.horizontal, 10).frame(height: 26)
                    .background(.white.opacity(0.92), in: Capsule())
                    .padding(.top, Spacing.s3)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .bottom) {
                Button { app.requireLogin(.filterPick(presetKey: key)) } label: {
                    Text(L.t("적용하기", "Apply"))
                        .font(AppFont.bodyEmphasis).foregroundStyle(Color.onInk)
                        .frame(maxWidth: .infinity).frame(height: captionSize == nil ? 36 : 44)
                        .background(Color.ink, in: Capsule())
                }
                .buttonStyle(PressScaleButtonStyle())
                .padding(.horizontal, captionSize == nil ? 8 : Spacing.s3)
                .padding(.bottom, captionSize == nil ? 8 : Spacing.s3)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
