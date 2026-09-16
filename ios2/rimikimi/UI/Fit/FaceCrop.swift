import UIKit
import Vision
import ImageIO

/// 정방향 맞춤(클라 부분, SPEC §3) — EXIF 로 바로 세운 뒤 얼굴 기준으로 3:4 크롭. 무료·로컬.
/// "채워 맞춤"(서버 `fit=outpaint`)은 여기 없다 — 준비 중.
enum FaceCrop {
    static let targetAspect: CGFloat = 3.0 / 4.0
    /// 3:4 에서 이만큼 벗어나면 제안한다.
    static let tolerance: CGFloat = 0.03

    static func needsFit(_ image: UIImage) -> Bool {
        guard image.size.width > 0, image.size.height > 0 else { return false }
        let a = image.size.width / image.size.height
        return abs(a - targetAspect) / targetAspect > tolerance
    }

    /// EXIF 방향을 픽셀에 굽는다(`.up` 으로).
    static func upright(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in image.draw(at: .zero) }
    }

    /// 얼굴을 찾아(없으면 가운데) 3:4 로 자른다. 얼굴이 세로 상단 ~38% 위치에 오게 잡는다.
    static func crop(_ source: UIImage) async -> UIImage {
        let image = upright(source)
        guard let cg = image.cgImage else { return image }
        let w = CGFloat(cg.width), h = CGFloat(cg.height)
        let faceCenter = await detectFaceCenter(cg) ?? CGPoint(x: w / 2, y: h * 0.42)

        var cw: CGFloat, ch: CGFloat
        if w / h > targetAspect { ch = h; cw = (h * targetAspect).rounded() }
        else { cw = w; ch = (w / targetAspect).rounded() }
        var x = faceCenter.x - cw / 2
        var y = faceCenter.y - ch * 0.38
        x = min(max(0, x), w - cw)
        y = min(max(0, y), h - ch)
        guard let out = cg.cropping(to: CGRect(x: x, y: y, width: cw, height: ch)) else { return image }
        return UIImage(cgImage: out, scale: 1, orientation: .up)
    }

    /// 가장 큰 얼굴의 중심(픽셀 좌표, 원점 좌상단).
    ///
    /// ⚠️ `VNImageRequestHandler.perform` 는 완료 핸들러를 **동기로** 부른다. 예전엔 완료 핸들러와
    /// `catch` 양쪽에서 continuation 을 resume 해 두 번 재개(또는 실패 시 0번)로 크래시났다
    /// (SWIFT TASK CONTINUATION MISUSE, 2026-09-16 정방향 맞춤에서 발견). resume 을 정확히 1회로 묶는다.
    static func detectFaceCenter(_ cg: CGImage) async -> CGPoint? {
        await withCheckedContinuation { (cont: CheckedContinuation<CGPoint?, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                var center: CGPoint?
                let req = VNDetectFaceRectanglesRequest()
                do {
                    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
                    let faces = (req.results as? [VNFaceObservation]) ?? []
                    if let best = faces.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
                        let b = best.boundingBox   // 정규화, 원점 좌하단
                        center = CGPoint(x: b.midX * CGFloat(cg.width), y: (1 - b.midY) * CGFloat(cg.height))
                    }
                } catch {
                    AppLog.ui.notice("face.detect.failed \(error.localizedDescription, privacy: .public)")
                }
                cont.resume(returning: center)   // 어느 경로든 정확히 한 번.
            }
        }
    }
}
