import SwiftUI
import UIKit
import ImageIO

/// 원격 이미지 — `URLSession` 으로 받아 `UIImage(data:)` 로 직접 디코드(iOS 는 WebP 네이티브 지원)하고
/// 메모리 캐시(NSCache) + 디스크 캐시(URLCache) 에 둔다. `AsyncImage` 는 시뮬레이터에서 `/thumbs/*.webp`
/// 를 회색으로만 남겨 이걸로 바꿨다. 로딩은 회색 채움, 실패도 조용히 회색.
struct RemoteImage: View {
    var url: URL?
    var cornerRadius: CGFloat = Radius.thumb
    /// `url` 이 없을 때(404 등) 대신 쓸 주소. 고해상도(`large/`)를 먼저 시도하고 아직 없는 컨셉은
    /// 썸네일로 되돌아가는 용도 — 새 컨셉이 올라왔는데 `large/` 만 빠져도 빈 회색으로 남지 않는다.
    var fallback: URL? = nil
    @State private var image: UIImage?

    /// ⚠️ 캐시에 이미 있으면 **만들어지는 그 자리에서** 꺼내 온다.
    ///
    /// `task` 로만 꺼내면 아무리 캐시가 채워져 있어도 첫 프레임은 반드시 회색이다(비동기라 한 박자
    /// 뒤에 온다). 한두 칸이면 몰라도, 격자 열 수를 바꾸면 수십 칸이 **동시에** 새로 만들어져서
    /// 화면 전체가 허옇게 떴다가 사진이 돌아온다. 핀치 전환이 "새로고침" 같아 보이던 진짜 이유가
    /// 이거였다 — 배치를 어떻게 바꾸든(애니메이션·확대축소·크로스페이드) 다 이 깜빡임에 먹혔다.
    /// 밝기를 프레임마다 재서 찾았다.
    init(url: URL?, cornerRadius: CGFloat = Radius.thumb, fallback: URL? = nil) {
        self.url = url
        self.cornerRadius = cornerRadius
        self.fallback = fallback
        _image = State(initialValue: url.flatMap(ImageLoader.cached)
                                  ?? fallback.flatMap(ImageLoader.cached))
    }

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
            if let hit = ImageLoader.cached(url) { image = hit; return }   // 대개 init 에서 이미 잡힌다
            if let loaded = await ImageLoader.shared.load(url) { image = loaded; return }
            guard let fallback, fallback != url else { return }
            if let hit = ImageLoader.shared.cached(fallback) { image = hit }
            else { image = await ImageLoader.shared.load(fallback) }
        }
    }
}

extension View {
    /// 사진 미리보기를 **3:4 로 강제**한다.
    ///
    /// ⚠️ `RemoteImage(...).aspectRatio(0.75, contentMode: .fit)` 만으로는 안 된다 — 썸네일마다
    /// 원본 비율이 달라서(400×536 도 있고 400×716 도 있다) 그 비율이 그대로 새어 나와 격자 줄마다
    /// 높이가 들쭉날쭉했다(5열에서 실측, 오너 지적 2026-09-22). 비율이 없는 `Color.clear` 로 틀을
    /// 먼저 잡고 그 위에 사진을 얹으면 원본이 뭐든 정확히 3:4 가 된다.
    func photoRatio(_ ratio: CGFloat = CardMetrics.aspect) -> some View {
        Color.clear
            .aspectRatio(ratio, contentMode: .fit)
            .overlay { self }
            .clipped()
    }
}

/// 캐시형 로더 — 같은 URL 의 동시 요청은 하나로 합친다.
@MainActor
final class ImageLoader {
    static let shared = ImageLoader()

    /// 액터 **밖**에 둔다 — `NSCache` 는 스스로 스레드 안전하고, 뷰가 만들어지는 그 자리(동기)에서
    /// 바로 꺼낼 수 있어야 첫 프레임부터 사진이 보인다(`RemoteImage.init` 주석 참고).
    nonisolated(unsafe) fileprivate static let cache: NSCache<NSURL, UIImage> = {
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

    /// 동기 조회. 비동기 대기 없이 바로 답한다.
    nonisolated static func cached(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func cached(_ url: URL) -> UIImage? { Self.cached(url) }

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
            Self.cache.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * 4))
        }
        return image
    }
}
