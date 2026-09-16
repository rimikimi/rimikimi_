#if DEBUG
import SwiftUI
import UIKit

/// 개발용 딥링크 — 시뮬레이터에는 터치 자동화가 없어 흐름을 URL 로 민다. **DEBUG 에서만 컴파일.**
///
///   com.rimikimi.app://dev/open?concept=<id>       옵션 화면 열기(번들 샘플 사진을 내 사진으로 등록)
///   com.rimikimi.app://dev/generate?concept=<id>   옵션 화면 열고 만들기 실행
///   com.rimikimi.app://dev/tab?name=gallery|filter|myPhotos|profile[&pop=1]
///   com.rimikimi.app://dev/photo                   샘플 사진만 등록
///   com.rimikimi.app://dev/pushtap?kind=genDone[&galleryId=<id>]  완료 푸시 탭(4주차: galleryId 있으면 정확 매칭)
///   com.rimikimi.app://dev/fitsheet?forceOutpaintPhase=running|error  채워 맞춤 진행/에러 상태 강제(캡처용)
///   com.rimikimi.app://dev/fitsheet?realOutpaint=1  실제 서버로 채워 맞춤 호출(크레딧 부족 시 크레딧 시트)
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
            app.openLatestGalleryResult()
        case "/pushtap":
            // 실제 알림 배너는 시뮬레이터에서 탭할 수 없다 — "완료 푸시 탭" 경로(PushManager → RootTabView)를 그대로 태운다.
            // galleryId 를 실으면 4주차 "정확한 결과 열기" 경로, 안 실으면 기존 "최신 항목" 폴백 경로를 탄다.
            app.push.simulateTap(kind: q["kind"] ?? "genDone", galleryId: q["galleryId"])
        case "/store": app.tab = .profile; app.profilePath = [.store]
        case "/invite": app.tab = .profile; app.profilePath = [.invite]
        case "/profile": app.tab = .profile; app.profilePath = []
        case "/credits":
            app.tab = .gallery; app.galleryPath = []
            if let id = q["concept"], let c = app.concepts.concept(id: id), let photo = app.userPhoto.image {
                app.pendingAfterPurchase = GenerateRequest(concept: c, photo: photo)
            }
            app.creditsSheet = true
        case "/tool":
            // 편집기·카메라 웹뷰를 직접 연다(3주차 캡처용) — 시뮬레이터엔 탭바 가운데 원/필터 프리셋을 누를 방법이 없다.
            switch q["kind"] {
            case "camera": app.webTool = .init(url: Config.cameraToolURL, title: "카메라")
            case "cameraShot":
                // 시뮬레이터엔 실카메라가 없어 셔터를 못 누른다 — "촬영 직후"(즉시 저장 → 다듬기·공유) 화면만 캡처.
                var c = URLComponents(url: Config.cameraToolURL, resolvingAgainstBaseURL: false)!
                c.queryItems = (c.queryItems ?? []) + [URLQueryItem(name: "debugShot", value: "1")]
                app.webTool = .init(url: c.url!, title: "카메라")
            case "edit":
                installSamplePhoto(app)
                if let img = app.userPhoto.image { app.openEditor(image: img) }
            default: app.webTool = .init(url: Config.filterToolURL(mode: "pick", presetKey: q["preset"]), title: "필터")
            }
        case "/guide": app.showGuide = true
        case "/guidedone": app.finishGuide()
        case "/invitecard": app.tab = .gallery; app.galleryPath = []; app.showInviteCard = true
        case "/fit", "/fitsheet":
            if url.path == "/fitsheet" { app.devAutoOpenFit = true }
            // 채워 맞춤 진행/에러 상태 캡처용 — 시뮬레이터엔 버튼 탭 자동화가 없어 상태를 직접 세팅한다.
            if let phase = q["forceOutpaintPhase"] {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    switch phase {
                    case "running": app.outpaintPhase = .running
                    // 실제 사용자 문구와 정확히 같은 텍스트를 캡처하려고 RimikimiAPI.outpaint() 의 실패 문구를 그대로 쓴다(상태코드 없음).
                    case "error": app.outpaintPhase = .error("채워 맞춤을 하지 못했어요. 크레딧은 차감되지 않았어요 🙂")
                    default: break
                    }
                }
            }
            // 샘플 사진을 4:3 로 잘라 "3:4 아님" 상황을 만든 뒤 결과 화면으로 연다(정방향 맞춤 제안 캡처용).
            installSamplePhoto(app)
            if let img = app.userPhoto.image, let cg = img.cgImage {
                let w = CGFloat(cg.width), h = (w * 3 / 4).rounded()
                let wide = cg.cropping(to: CGRect(x: 0, y: max(0, CGFloat(cg.height) / 2 - h / 2), width: w, height: h)).map { UIImage(cgImage: $0) } ?? img
                app.present([.init(id: "dev-fit", image: wide, url: nil, expiresAt: nil)],
                            job: .init(conceptId: "766", conceptTitle: "정방향 맞춤 데모", startedAt: Date(), count: 1))
                // 실제 네트워크 채워 맞춤 호출 검증용 — 크레딧 부족이면 크레딧 시트, 아니면 실서버 응답(현재 미배포 → 오류)을 그대로 탄다.
                if q["realOutpaint"] == "1" {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        app.requestOutpaint(wide) { _ in AppLog.ui.info("dev.realOutpaint.success") }
                    }
                }
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
