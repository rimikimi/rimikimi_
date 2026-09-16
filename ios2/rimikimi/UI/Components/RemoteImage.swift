import SwiftUI

/// 원격 이미지 — 로딩은 회색 채움, 실패는 조용히 회색. 썸네일(`/thumbs/{id}.webp`)과 갤러리 서명 URL 공용.
struct RemoteImage: View {
    var url: URL?
    var cornerRadius: CGFloat = Radius.thumb

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                Color.fill
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
