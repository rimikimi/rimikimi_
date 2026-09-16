import SwiftUI
import UIKit
import ImageIO

/// 원격 이미지 — `URLSession` 으로 받아 `UIImage(data:)` 로 직접 디코드(iOS 는 WebP 네이티브 지원)하고
/// 메모리 캐시(NSCache) + 디스크 캐시(URLCache) 에 둔다. `AsyncImage` 는 시뮬레이터에서 `/thumbs/*.webp`
/// 를 회색으로만 남겨 이걸로 바꿨다. 로딩은 회색 채움, 실패도 조용히 회색.
struct RemoteImage: View {
    var url: URL?
    var cornerRadius: CGFloat = Radius.thumb
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Color.fill
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
                    .transition(.opacity)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .animation(.easeOut(duration: 0.2), value: image != nil)
        .task(id: url) {
            guard let url else { image = nil; return }
            if let cached = ImageLoader.shared.cached(url) { image = cached; return }
            image = await ImageLoader.shared.load(url)
        }
    }
}

/// 캐시형 로더 — 같은 URL 의 동시 요청은 하나로 합친다.
@MainActor
final class ImageLoader {
    static let shared = ImageLoader()

    private let cache: NSCache<NSURL, UIImage> = {
        let c = NSCache<NSURL, UIImage>()
        c.countLimit = 600
        c.totalCostLimit = 128 << 20
        return c
    }()
    private var inflight: [URL: Task<UIImage?, Never>] = [:]
    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.urlCache = URLCache(memoryCapacity: 32 << 20, diskCapacity: 512 << 20)
        cfg.requestCachePolicy = .returnCacheDataElseLoad
        cfg.timeoutIntervalForRequest = 30
        return URLSession(configuration: cfg)
    }()

    func cached(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }

    /// 갤러리 원본은 2K PNG(≈10MB)라 그대로 디코드하면 느리고 메모리도 크다 — ImageIO 로 긴 변 `maxPixel` 까지만 푼다.
    /// (앨범 저장은 원본이 필요하므로 별도 경로 — 2주차.)
    nonisolated static func downsample(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        let opts: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let src = CGImageSourceCreateWithData(data as CFData, opts as CFDictionary) else { return nil }
        let thumbOpts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, thumbOpts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    func load(_ url: URL) async -> UIImage? {
        if let hit = cached(url) { return hit }
        if let task = inflight[url] { return await task.value }
        let task = Task<UIImage?, Never> { [session] in
            guard let (data, resp) = try? await session.data(from: url),
                  (resp as? HTTPURLResponse).map({ (200...299).contains($0.statusCode) }) ?? true,
                  let raw = ImageLoader.downsample(data, maxPixel: 1600) ?? UIImage(data: data) else {
                AppLog.api.notice("image.load.failed \(url.lastPathComponent, privacy: .public)")
                return nil
            }
            // 디코드를 미리 해 두면 스크롤 중 첫 그리기에서 멈칫하지 않는다.
            return await raw.byPreparingForDisplay() ?? raw
        }
        inflight[url] = task
        let image = await task.value
        inflight[url] = nil
        if let image {
            cache.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * 4))
        }
        return image
    }
}
