#if DEBUG
import SwiftUI
import UIKit

/// 개발용 딥링크 — 시뮬레이터에는 터치 자동화가 없어 흐름을 URL 로 민다. **DEBUG 에서만 컴파일.**
///
///   com.rimikimi.app://dev/open?concept=<id>       옵션 화면 열기(번들 샘플 사진을 내 사진으로 등록)
///   com.rimikimi.app://dev/generate?concept=<id>   옵션 화면 열고 만들기 실행
///   com.rimikimi.app://dev/tab?name=gallery|filter|myPhotos|profile[&pop=1]
///   com.rimikimi.app://dev/photo                   샘플 사진만 등록
@MainActor
enum DevRoutes {
    /// 처리했으면 true.
    static func handle(_ url: URL, app: AppState) -> Bool {
        guard url.scheme == Config.oauthScheme, url.host == "dev" else { return false }
        let q = AuthStore.params(of: url)
        switch url.path {
        case "/photo":
            installSamplePhoto(app)
        case "/open", "/generate":
            guard let id = q["concept"], let concept = app.concepts.concept(id: id) else {
                AppLog.ui.error("dev.route concept not found \(q["concept"] ?? "-", privacy: .public)"); return true
            }
            installSamplePhoto(app)
            app.myPhotosPath.removeAll()
            app.tab = .gallery
            app.galleryPath = [.concept(concept)]
            if url.path == "/generate", let photo = app.userPhoto.image {
                var req = GenerateRequest(concept: concept, photo: photo)
                req.count = Int(q["count"] ?? "1") ?? 1
                AppLog.ui.info("dev.generate concept=\(concept.id, privacy: .public)")
                app.requireLogin(.generate(req))
            }
        case "/result":
            // 갤러리의 최신 항목을 결과 화면으로 연다(자동 표시는 1회뿐이라 캡처용).
            Task {
                guard let token = await app.auth.validAccessToken(),
                      let item = try? await RimikimiAPI.shared.fetchGallery(token: token).first else { return }
                app.present([.init(id: item.id, image: nil, url: item.url, expiresAt: item.expiresAt)],
                            job: .init(conceptId: item.conceptId ?? "", conceptTitle: item.conceptTitle ?? "", startedAt: item.createdAt ?? Date(), count: 1))
            }
        case "/tab":
            switch q["name"] {
            case "gallery": app.tab = .gallery
            case "filter": app.tab = .filter
            case "myPhotos": app.tab = .myPhotos
            case "profile": app.tab = .profile
            default: break
            }
            if q["pop"] == "1" { app.galleryPath.removeAll(); app.myPhotosPath.removeAll(); app.profilePath.removeAll() }
        default:
            return false
        }
        return true
    }

    /// `xcrun simctl launch <udid> com.rimikimi.app -rimikimi-url "<url>"` — 딥링크는 "Open in rimikimi?" 확인이 떠서
    /// 시뮬레이터에서 못 누른다. 실행 인자로 같은 URL 을 받으면 확인 없이 처리한다(세션 딥링크도 여기로).
    static func handleLaunchArguments(app: AppState) {
        let args = ProcessInfo.processInfo.arguments
        var urls: [URL] = []
        var i = 0
        while i < args.count {
            if args[i] == "-rimikimi-url", i + 1 < args.count, let u = URL(string: args[i + 1]) { urls.append(u); i += 1 }
            i += 1
        }
        for url in urls {
            if handle(url, app: app) { continue }
            if (try? app.auth.handleCallback(url)) == true {
                AppLog.auth.info("launcharg.session.ok")
                app.resumePending()
            }
        }
    }

    static func installSamplePhoto(_ app: AppState) {
        guard !app.userPhoto.hasPhoto,
              let url = Bundle.main.url(forResource: "e2e_sample_person", withExtension: "jpg"),
              let data = try? Data(contentsOf: url), let img = UIImage(data: data) else { return }
        app.userPhoto.set(img)
    }
}
#endif
