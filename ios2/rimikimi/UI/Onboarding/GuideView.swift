import SwiftUI

/// 첫 실행 가이드 1장 — 1.x `Guide.jsx` intro 의 "3단계면 끝나요" 문구 그대로. 실행 시 다른 팝업 없음.
struct GuideView: View {
    var onDone: () -> Void

    private let steps: [(String, String)] = [
        ("1. 컨셉 고르기", "매일 저녁 8시에 새 컨셉이 올라와요."),
        ("2. 사진 한 장 올리기", "얼굴이 잘 보이는 사진이면 충분해요."),
        ("3. 기다리기", "최대 몇 분 걸려요. 앱을 닫아도 계속 만들어지고, 다 되면 알려드려요."),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)
            BrandLogo(height: 34).frame(maxWidth: .infinity).padding(.bottom, Spacing.s6)
            Text("3단계면 끝나요").font(AppFont.title2).tracking(Tracking.title2).padding(.bottom, Spacing.s4)
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
            Text("만든 사진은 1시간 뒤 사라져요. 마음에 들면 꼭 저장하세요.")
                .font(AppFont.footnote).foregroundStyle(Color.ink2).padding(.top, Spacing.s3)
            Spacer(minLength: 0)
            Button("시작하기") { HapticPlayer.commit(); onDone() }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.bottom, Spacing.s2)
        }
        .padding(.horizontal, Spacing.s5)
        .background(Color.bg.ignoresSafeArea())
    }
}
