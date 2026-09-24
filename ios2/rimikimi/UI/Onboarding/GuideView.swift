import SwiftUI

/// 첫 실행 가이드 1장 — 1.x `Guide.jsx` intro 의 "3단계면 끝나요" 문구 그대로. 실행 시 다른 팝업 없음.
struct GuideView: View {
    var onDone: () -> Void

    private let steps: [(String, String)] = Copy.guideSteps

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)
            BrandLogo(height: 34).frame(maxWidth: .infinity).padding(.bottom, Spacing.s6)
            Text(Copy.guideTitle).font(AppFont.title2).tracking(Tracking.title2).padding(.bottom, Spacing.s4)
            VStack(alignment: .leading, spacing: Spacing.s3) {
                ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(s.0).font(AppFont.headline)
                        Text(s.1).font(AppFont.callout).foregroundStyle(Color.ink2)
                    }
                    .padding(Spacing.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    .staggerIn(delay: Double(i) * 0.06)
                }
            }
            Text(Copy.guideExpire)
                .font(AppFont.footnote).foregroundStyle(Color.ink2).padding(.top, Spacing.s3)
            Spacer(minLength: 0)
            Button(Copy.guideStart) { HapticPlayer.commit(); onDone() }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.bottom, Spacing.s2)
        }
        .padding(.horizontal, Spacing.s5)
        .background(Color.bg.ignoresSafeArea())
    }
}
