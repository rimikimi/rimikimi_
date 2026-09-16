import UIKit

/// 사진 축소·인코딩 — 웹 `shrinkImage(dataUrl, 1024, 0.85)` 와 같은 결과(긴 변 기준, JPEG).
enum ImageUtil {
    struct Payload { let mimeType: String; let base64: String }

    static func jpegPayload(_ image: UIImage, maxSide: CGFloat, quality: CGFloat) -> Payload {
        let scaled = resize(image, maxSide: maxSide)
        let data = scaled.jpegData(compressionQuality: quality) ?? Data()
        return Payload(mimeType: "image/jpeg", base64: data.base64EncodedString())
    }

    /// 방향(EXIF)을 픽셀에 굽고 긴 변을 `maxSide` 이하로 줄인다.
    static func resize(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let w = image.size.width, h = image.size.height
        let scale = min(1, maxSide / max(w, h))
        let target = CGSize(width: (w * scale).rounded(), height: (h * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    static func decode(base64: String) -> UIImage? {
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }
}
