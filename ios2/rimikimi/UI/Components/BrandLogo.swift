import SwiftUI

/// 하트 워드마크 — `store_assets/promo_couple.html` 의 SVG 를 그대로 에셋(벡터 보존)으로 넣었다.
/// 라이트=잉크 글자, 다크=밝은 글자. 하트 4색은 두 모드 같다.
struct BrandLogo: View {
    var height: CGFloat = 26
    var body: some View {
        Image("BrandLogo")
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .accessibilityLabel("rimikimi")
    }
}
