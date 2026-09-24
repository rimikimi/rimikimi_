import Foundation
import AuthenticationServices
import Observation

/// 로그인 상태 + Supabase 세션 갱신. 로그인 **시점**은 `v2/SPEC.md` §3 — 만들기·필터 사진 고르기·카메라
/// 직전에만 `AppState.requireLogin` 이 시트를 띄운다. 여기는 방법만 안다.
///
/// - Apple: 네이티브 시트 → `id_token` 을 Supabase 에 교환(`grant_type=id_token`).
///   Supabase Apple 제공자에 앱 번들 ID 가 Client ID 로 등록돼 있어야 한다. 안 돼 있으면 웹 OAuth 로 물러선다.
/// - 카카오 · Google: `ASWebAuthenticationSession` 으로 `/auth/v1/authorize` → 딥링크 fragment 의 토큰.
/// - 네이버: 우리 백엔드 `api/auth/naver/start` → magic link → 같은 딥링크.
@MainActor
@Observable
final class AuthStore {
    static let shared = AuthStore()

    enum Provider: String, CaseIterable, Identifiable {
        case apple, kakao, naver, google
        var id: String { rawValue }
        var title: String {
            switch self {
            case .apple: return Copy.loginApple
            case .kakao: return Copy.loginKakao
            case .naver: return Copy.loginNaver
            case .google: return Copy.loginGoogle
            }
        }
    }

    private(set) var session: AuthSession?
    private(set) var busy: Provider?
    private(set) var lastError: String?
    /// 로그인 직후 한 번 올라간다 — `AppState` 가 보고 하던 동작을 이어간다.
    private(set) var signInTick = 0

    private let keychain = SessionKeychain()
    private let apple = AppleSignIn()

    private init() {
        session = keychain.read()
    }

    var isSignedIn: Bool { session != nil }

    #if DEBUG
    /// 캡처/개발용 — 실제 OAuth 없이 로그인 상태만 흉내낸다. `DevRoutes` `dev/devsignin` 참고.
    func devSetSession(_ s: AuthSession) {
        session = s
        keychain.write(s)
        signInTick += 1
    }
    #endif

    var displayLabel: String {
        guard let s = session else { return Copy.signedOut }
        if let n = s.displayName, !n.isEmpty { return n }
        if let e = s.email, !e.isEmpty { return e }
        return Copy.signedIn
    }

    // MARK: 토큰

    /// 유효한 액세스 토큰. 만료가 가까우면 refresh_token 으로 갈아 끼운다. 못 갈면 nil(로그아웃 처리).
    func validAccessToken() async -> String? {
        guard let s = session else { return nil }
        if !s.isExpiringSoon { return s.accessToken }
        guard let refresh = s.refreshToken else { forcedSignOut(); return nil }
        do {
            let json = try await SupabaseAuthAPI.token(grant: "refresh_token", body: ["refresh_token": refresh])
            adopt(json: json, provider: s.provider)
            return session?.accessToken
        } catch {
            // ⚠️ 서버가 **명시적으로 거절(4xx: invalid_grant 등)** 했을 때만 로그아웃한다.
            //    예전엔 catch 가 모든 에러를 로그아웃 사유로 봐서, 지하철·비행기모드처럼 잠깐
            //    끊긴 상태에서 앱을 켜기만 해도 로그아웃되고 키체인의 refresh_token 까지 지워졌다
            //    (2026-09-18 버그 스윕 확정 · 사용자는 아무것도 안 눌렀다). 네트워크 실패·5xx·
            //    취소는 세션을 그대로 두고 nil 만 돌려준다 — 연결이 돌아오면 다음 호출이 갱신한다.
            let status = (error as? SupabaseAuthAPI.Failure)?.status ?? 0
            AppLog.auth.error("refresh.failed status=\(status) \(error.localizedDescription, privacy: .public)")
            // 429(요청 제한)·408, 공용 Wi-Fi 포털이 주는 엉뚱한 4xx 로는 로그아웃하지 않는다.
            if [400, 401, 403].contains(status) { forcedSignOut() }
            return nil
        }
    }

    // MARK: 로그인

    func signIn(_ provider: Provider) async {
        guard busy == nil else { return }
        busy = provider
        lastError = nil
        defer { busy = nil }
        do {
            switch provider {
            case .apple:
                do {
                    let cred = try await apple.request()
                    let json = try await SupabaseAuthAPI.token(grant: "id_token",
                                                               body: ["provider": "apple", "id_token": cred.idToken, "nonce": cred.rawNonce])
                    adopt(json: json, provider: "apple")
                } catch let e as AppleSignIn.Failure where e == .cancelled {
                    return   // 시트를 닫은 것은 실패가 아니다.
                } catch let e as SupabaseAuthAPI.Failure {
                    // 번들 ID 가 Supabase 에 등록돼 있지 않으면 여기로 온다 — 웹 OAuth 로 물러선다.
                    AppLog.auth.notice("apple.native.failed → web fallback \(e.message, privacy: .public)")
                    try await signInViaWeb(url: SupabaseAuthAPI.authorizeURL(provider: "apple"))
                }
            case .kakao:
                try await signInViaWeb(url: SupabaseAuthAPI.authorizeURL(provider: "kakao"))
            case .google:
                try await signInViaWeb(url: SupabaseAuthAPI.authorizeURL(provider: "google"))
            case .naver:
                try await signInViaWeb(url: Config.naverStartURL)
            }
            if session != nil {
                signInTick += 1
                AppLog.auth.info("signin.ok provider=\(provider.rawValue, privacy: .public)")
            }
        } catch let e as WebAuth.Failure where e == .cancelled {
            // 사용자가 닫음
        } catch {
            lastError = Self.friendly(error)
            AppLog.auth.error("signin.failed \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: Apple (SwiftUI `SignInWithAppleButton` 경로)

    private var appleNonce = ""

    /// `SignInWithAppleButton.onRequest` — nonce 를 만들어 SHA-256 으로 실어 보낸다.
    func prepareApple(_ request: ASAuthorizationAppleIDRequest) {
        appleNonce = AppleSignIn.randomNonce()
        request.requestedScopes = [.fullName, .email]
        request.nonce = AppleSignIn.sha256(appleNonce)
    }

    /// `SignInWithAppleButton.onCompletion` — id_token 을 Supabase 세션으로 바꾼다. 실패하면 웹 OAuth 폴백.
    func completeApple(_ result: Result<ASAuthorization, Error>) async {
        guard busy == nil else { return }
        lastError = nil
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            lastError = Copy.loginNotFinished
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let data = cred.identityToken, let idToken = String(data: data, encoding: .utf8) else {
                lastError = Copy.loginInfoUnreadable; return
            }
            busy = .apple
            defer { busy = nil }
            do {
                let json = try await SupabaseAuthAPI.token(grant: "id_token",
                                                           body: ["provider": "apple", "id_token": idToken, "nonce": appleNonce])
                adopt(json: json, provider: "apple")
            } catch let e as SupabaseAuthAPI.Failure {
                AppLog.auth.notice("apple.native.failed → web fallback \(e.message, privacy: .public)")
                do { try await signInViaWeb(url: SupabaseAuthAPI.authorizeURL(provider: "apple")) }
                catch let w as WebAuth.Failure where w == .cancelled { return }
                catch { lastError = Self.friendly(error); return }
            } catch {
                lastError = Self.friendly(error); return
            }
            if session != nil {
                signInTick += 1
                AppLog.auth.info("signin.ok provider=apple")
            }
        }
    }

    private func signInViaWeb(url: URL) async throws {
        let callback = try await WebAuth.run(url: url, scheme: Config.oauthScheme)
        try handleCallback(callback)
    }

    /// 딥링크 처리 — `ASWebAuthenticationSession` 이 받는 게 정상이지만, 외부 브라우저에서 돌아오는
    /// 경우(`onOpenURL`)도 같은 함수로 받는다.
    @discardableResult
    func handleCallback(_ url: URL) throws -> Bool {
        let params = Self.params(of: url)
        if let err = params["error_description"] ?? params["error"] {
            throw SupabaseAuthAPI.Failure(message: err.removingPercentEncoding ?? err)
        }
        guard let access = params["access_token"] else { return false }
        guard let s = AuthSession.from(accessToken: access, refreshToken: params["refresh_token"]) else { return false }
        session = s
        keychain.write(s)
        return true
    }

    /// 5주차 — 1.x → 2.0 로그인 이전(`LegacySessionMigration`). 1.x WKWebView(`localStorage`)에서 건진
    /// refresh_token 으로 새 세션을 발급받아 그대로 채택한다. 실패하면 그냥 false(평소처럼 로그인 화면).
    @discardableResult
    func adoptLegacyRefreshToken(_ refreshToken: String) async -> Bool {
        guard session == nil else { return false }
        do {
            let json = try await SupabaseAuthAPI.token(grant: "refresh_token", body: ["refresh_token": refreshToken])
            adopt(json: json, provider: nil)
            if session != nil {
                signInTick += 1
                AppLog.auth.info("legacy.migration.ok")
                return true
            }
        } catch {
            AppLog.auth.notice("legacy.migration.failed \(error.localizedDescription, privacy: .public)")
        }
        return false
    }

    private func adopt(json: [String: Any], provider: String?) {
        guard let access = json["access_token"] as? String,
              var s = AuthSession.from(accessToken: access, refreshToken: json["refresh_token"] as? String) else { return }
        if s.provider == nil { s.provider = provider }
        session = s
        keychain.write(s)
    }

    func signOut() {
        session = nil
        keychain.clear()
    }

    /// 서버가 토큰을 **거절**해 강제로 로그아웃될 때 앱 전체 정리(얼굴 사진·스캔·카드·탭 스택)를
    /// 돌리게 AppState 가 연결한다. 없으면 이 경로만 정리를 건너뛰어, 다음 계정이 로그인했을 때
    /// 앞사람 얼굴이 생성 참조로 나갔다(2026-09-23 스윕 U3).
    var onForcedSignOut: (() -> Void)?
    private func forcedSignOut() {
        signOut()
        onForcedSignOut?()
    }

    // MARK: -

    /// 쿼리와 fragment 를 함께 읽는다 — Supabase implicit 흐름은 `#access_token=…` 으로 온다.
    static func params(of url: URL) -> [String: String] {
        var out: [String: String] = [:]
        func take(_ s: String?) {
            guard let s else { return }
            for pair in s.split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
                guard kv.count == 2 else { continue }
                out[kv[0]] = kv[1].replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? kv[1]
            }
        }
        take(url.query)
        take(url.fragment)
        return out
    }

    /// 웹 `LoginGate` 의 문구 규칙 — 같은 이메일이 다른 제공자로 가입된 충돌은 친절하게.
    private static func friendly(_ error: Error) -> String {
        let blob = error.localizedDescription.lowercased()
        if blob.range(of: "exist|already|registered|duplicate|server_error|database error|saving new user", options: .regularExpression) != nil {
            return Copy.loginEmailTaken
        }
        return error.localizedDescription.isEmpty ? Copy.loginFailedRetry : error.localizedDescription
    }
}

/// Supabase GoTrue REST — 클라이언트 SDK 없이 두 엔드포인트만 쓴다.
enum SupabaseAuthAPI {
    struct Failure: LocalizedError {
        var message: String
        /// HTTP 상태. 0 = 서버 응답을 못 받음(네트워크). 로그아웃 여부를 이 값으로 가른다.
        var status: Int = 0
        var errorDescription: String? { message }
    }

    static func token(grant: String, body: [String: Any]) async throws -> [String: Any] {
        var req = URLRequest(url: URL(string: Config.supabaseURL.absoluteString + "/auth/v1/token?grant_type=" + grant)!)
        req.httpMethod = "POST"
        req.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let msg = (json["error_description"] as? String) ?? (json["msg"] as? String) ?? (json["error"] as? String) ?? Copy.loginFailed
            throw Failure(message: msg, status: (resp as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return json
    }

    static func authorizeURL(provider: String) -> URL {
        var c = URLComponents(url: Config.supabaseURL.appendingPathComponent("auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "provider", value: provider),
                        URLQueryItem(name: "redirect_to", value: Config.oauthRedirect)]
        return c.url!
    }
}
