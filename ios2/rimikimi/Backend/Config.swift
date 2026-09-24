import Foundation

/// 서버 주소와 공개 키. anon 키는 브라우저에도 노출되는 공개 키다(`src/supabaseClient.js`).
/// 그 밖의 비밀은 여기 두지 않는다 — 서버(Vercel `api/`)가 가진다.
enum Config {
    /// Vercel 프록시 — `/api/*`, `/concepts.json`, `/thumbs/{id}.webp`
    static let apiBase = URL(string: "https://rimikimi-app.vercel.app")!
    static let supabaseURL = URL(string: "https://hedgjzdrivilclmwumoc.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlZGdqemRyaXZpbGNsbXd1bW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTk1MjksImV4cCI6MjA5NTI3NTUyOX0.Hp88oUR53x4dEwnfYoxreDHUvZWZHiA4Skm_2nozVa8"
    /// OAuth 복귀 딥링크 — Supabase Redirect URL 에 등록돼 있다(`src/LoginGate.jsx` NATIVE_REDIRECT).
    static let oauthRedirect = "com.rimikimi.app://login-callback"
    static let oauthScheme = "com.rimikimi.app"
    /// 네이버는 우리 백엔드가 시작한다(`api/auth/naver/start`) → magic link → 딥링크.
    static var naverStartURL: URL {
        var c = URLComponents(url: apiBase.appendingPathComponent("api/auth/naver/start"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "redirectTo", value: oauthRedirect)]
        return c.url!
    }
    /// 편집기·카메라 1단계(웹뷰 임베드, SPEC §5) — 배포된 웹(`https://rimikimi-app.vercel.app`)을 그대로 연다.
    /// 로컬 번들이 아니라 배포 URL 을 쓰는 이유: 이미 1주차 Config 가 이렇게 정했고(원격 로드 원칙과 동일),
    /// `src/PhotoEditor.jsx`·`src/CameraStudio.jsx` 는 웹 배포 파이프라인 하나로 web/iOS/Android 세 곳이
    /// 같이 갱신된다 — 번들에 복사하면 그 셋을 매번 따로 동기화해야 한다.
    #if DEBUG
    /// 로컬 `vite dev` 로 미검증 웹 변경을 시뮬레이터에서 확인할 때만 쓴다.
    /// `-rimikimi-web-base http://127.0.0.1:5173` 실행 인자로 넘긴다. Release 빌드엔 없다.
    static let webToolBaseOverride: URL? = {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-rimikimi-web-base"), i + 1 < args.count { return URL(string: args[i + 1]) }
        return nil
    }()
    #endif
    static var webToolBase: URL {
        #if DEBUG
        if let o = webToolBaseOverride { return o }
        #endif
        return apiBase
    }
    /// 웹뷰 도구에 넘길 언어. 웹뷰의 localStorage 는 앱과 별개 저장소이고 웹은
    /// navigator.language 로 언어를 정한다. 안 넘기면 **껍데기는 한국어인데 안쪽
    /// 편집기·카메라만 기기 언어(영어)** 로 뜬다(영어 시뮬에서 실측).
    /// 앱 문구와 같은 언어(`L` — 기기 첫 언어가 한국어면 ko, 아니면 en)로 맞춘다.
    static var webToolLang: String { L.code }
    /// mode: "pick"(필터 프리셋 → 사진 최대 10장 → 편집기) · "edit"(결과 화면 "다듬기", 사진 1장 바로 편집).
    static func filterToolURL(mode: String, presetKey: String? = nil) -> URL {
        var c = URLComponents(url: webToolBase, resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "tool", value: "filter"), URLQueryItem(name: "mode", value: mode),
                     URLQueryItem(name: "lang", value: webToolLang)]
        if let presetKey { items.append(URLQueryItem(name: "preset", value: presetKey)) }
        c.queryItems = items
        return c.url!
    }
    static var cameraToolURL: URL {
        var c = URLComponents(url: webToolBase, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "tool", value: "camera"),
                        URLQueryItem(name: "lang", value: webToolLang)]
        return c.url!
    }

    /// RevenueCat Apple 공개 SDK 키(`VITE_RC_IOS_KEY`, 클라이언트 노출용). 비어 있으면 스토어는 자리만 보여 준다.
    static let revenueCatIOSKey = "appl_apQGEEGcMgFjBaHTxGCvrSTgbux"
    /// 친구 초대 스마트링크(`/i/CODE`) — 누르면 쓰는 기기의 스토어로 간다.
    static func inviteURL(code: String) -> URL { apiBase.appendingPathComponent("i/\(code)") }
    static let termsURL = apiBase.appendingPathComponent("terms")
    static let privacyURL = apiBase.appendingPathComponent("privacy")
    static let refundURL = apiBase.appendingPathComponent("refund")
    /// 증명사진(idphoto) 컨셉은 1.x 와 동일하게 rimikimi 안에서 만들지 않고 전문앱 Brooklyn 으로 유도한다
    /// (`src/PortraitStudio.jsx` `openBrooklyn()`과 같은 목적지 — iOS 앱스토어 상세 페이지).
    static let brooklynAppStoreURL = URL(string: "https://apps.apple.com/app/id6784226620")!

    static func thumbURL(_ id: String) -> URL { apiBase.appendingPathComponent("thumbs/\(id).webp") }
    /// 크게 보여주는 자리(브라우저 큰 사진·옵션 화면 히어로·앨범 표지)용 1200px WebP.
    /// 썸네일은 400px 라 전체 폭(402pt = 1206px)에 깔면 3배 확대돼 뭉갠다(오너 지적 2026-09-22).
    /// 아직 `large/` 가 없는 컨셉은 `RemoteImage(fallback:)` 이 썸네일로 되돌아간다.
    static func largeURL(_ id: String) -> URL { apiBase.appendingPathComponent("large/\(id).webp") }
    static let bundleID = "com.rimikimi.app"
}
