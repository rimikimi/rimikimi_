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
    /// 편집기·카메라 1단계(웹뷰 임베드, SPEC §5).
    static let filterToolURL = URL(string: "https://rimikimi-app.vercel.app/?tool=filter")!
    static let cameraToolURL = URL(string: "https://rimikimi-app.vercel.app/?tool=camera")!

    static func thumbURL(_ id: String) -> URL { apiBase.appendingPathComponent("thumbs/\(id).webp") }
    static let bundleID = "com.rimikimi.app"
}
