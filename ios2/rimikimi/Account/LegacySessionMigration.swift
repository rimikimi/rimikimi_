import WebKit
import UIKit

/// 5주차 — "1.x → 2.0 업데이트 시 로그인 유지"를 포기하기 전에 실제로 시도해 본 것.
///
/// 1.x(Capacitor, `capacitor.config.ts`: `ios.scheme = "rimikimi"`, hostname 기본값 `localhost`)는
/// Supabase 세션을 그 WKWebView 의 **`rimikimi://localhost` 오리진 localStorage**에 저장한다
/// (`src/supabaseClient.js` 는 storage 어댑터를 지정하지 않아 `@supabase/supabase-js` 기본값을 그대로
/// 쓰고, 그 기본 storageKey 는 `sb-<프로젝트 host 첫 라벨>-auth-token` — 이 프로젝트는
/// `sb-hedgjzdrivilclmwumoc-auth-token`). Capacitor 의 `CAPBridgeViewController` 도 웹뷰 설정에서
/// `websiteDataStore` 를 별도로 바꾸지 않으므로 **기본(영구) `WKWebsiteDataStore.default()`**를 쓴다 —
/// 이 저장소는 앱 컨테이너 안에 있고, 번들 ID 가 같은 채로 앱을 업데이트(1.x → 2.0)하면 컨테이너가
/// 그대로 유지되는 iOS 표준 동작이라 **이 데이터도 살아 있을 가능성이 높다**.
///
/// 그래서 2.0 이 같은 오리진(`rimikimi://localhost`)에 대해 같은 기본 데이터 저장소를 쓰는 숨은
/// WKWebView 를 하나 띄우고 그 오리진의 localStorage 를 읽어 보면, 1.x 가 로그인해 둔 세션을 건질 수
/// 있는지 확인할 수 있다 — 이게 이 파일이 하는 일이다. 성공하면 `AuthStore.adoptLegacyRefreshToken`
/// 으로 새 액세스 토큰을 받아 그대로 로그인 상태가 된다. 실패해도 부작용 없음(그냥 평소 로그인 화면).
///
/// 시뮬레이터에는 1.x 앱이 심어 둔 진짜 데이터가 없어 "빈 값 → 실패"로 끝나는 게 정상이다. 이 메커니즘
/// 자체가 실제로 값을 건져 오는지는 **1.x가 실제로 깔려 있던 실기기에서 2.0으로 업데이트했을 때만
/// 확정적으로 검증 가능** — 코드 경로는 여기서 시뮬레이터로 "쓰기→다시 읽기" 왕복까지 확인했다
/// (`DevRoutes` `dev/legacymigration` 참고).
@MainActor
enum LegacySessionMigration {
    /// 1.x 가 실제로 쓴 값. `capacitor.config.ts`(`ios.scheme`) + `src/supabaseClient.js`(스토리지 미지정
    /// → `@supabase/supabase-js` 기본 `sb-<host 첫 라벨>-auth-token`) 로 역산.
    static let legacyOrigin = "rimikimi://localhost"
    static let storageKey = "sb-hedgjzdrivilclmwumoc-auth-token"

    private static let attemptedFlag = "legacyMigration.attempted.v1"

    /// 앱 시작 시 1회만: 이미 로그인돼 있거나 이미 시도했으면 즉시 반환. 성공하면 true.
    @discardableResult
    static func attemptOnce() async -> Bool {
        guard !AuthStore.shared.isSignedIn else { return false }
        guard !UserDefaults.standard.bool(forKey: attemptedFlag) else { return false }
        UserDefaults.standard.set(true, forKey: attemptedFlag)
        guard let raw = await readLegacyLocalStorage(key: storageKey) else {
            AppLog.auth.info("legacy.migration.none")
            return false
        }
        guard let refreshToken = Self.refreshToken(fromRawValue: raw) else {
            AppLog.auth.notice("legacy.migration.unparseable")
            return false
        }
        return await AuthStore.shared.adoptLegacyRefreshToken(refreshToken)
    }

    /// 1.x localStorage 값(JSON 문자열, GoTrue `Session` 모양) → refresh_token.
    static func refreshToken(fromRawValue raw: String) -> String? {
        guard let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        // supabase-js 는 세션 객체를 그대로 저장한다({currentSession:{...}} 구버전 모양도 방어).
        if let token = obj["refresh_token"] as? String { return token }
        if let current = obj["currentSession"] as? [String: Any], let token = current["refresh_token"] as? String { return token }
        return nil
    }

    /// 숨은 WKWebView 로 `rimikimi://localhost` 오리진의 localStorage[key] 를 읽는다.
    private static func readLegacyLocalStorage(key: String) async -> String? {
        await withCheckedContinuation { continuation in
            let runner = LegacyWebViewRunner(key: key) { value in
                continuation.resume(returning: value)
            }
            runner.start()
        }
    }

    #if DEBUG
    /// 시뮬레이터엔 진짜 1.x 가 심어 둔 데이터가 없다 — "쓰기→다시 읽기" 왕복으로 매커니즘 자체(같은
    /// 오리진의 영구 `WKWebsiteDataStore` 를 실제로 공유해서 읽어오는지)만 검증한다.
    /// `com.rimikimi.app://dev/legacymigration?write=1` 로 호출.
    static func debugSeedAndVerify() async -> String {
        let fakeSession = """
        {"access_token":"fake.debug.token","refresh_token":"debug-refresh-token-123","expires_at":9999999999,"token_type":"bearer"}
        """
        let wrote = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            let runner = LegacyWebViewRunner(writeKey: storageKey, writeValue: fakeSession) { ok in
                continuation.resume(returning: ok)
            }
            runner.start()
        }
        guard wrote else { return "쓰기 실패" }
        let readBack = await readLegacyLocalStorage(key: storageKey)
        return readBack == fakeSession
            ? "성공 — 같은 오리진(\(legacyOrigin))의 영구 저장소에 쓰고 다시 읽었다: \(readBack ?? "")"
            : "실패 — 쓴 값과 읽은 값이 다름: \(readBack ?? "nil")"
    }
    #endif
}

/// `WKURLSchemeHandler` — "rimikimi" 스킴에 빈 문서 하나를 즉시 응답해 그 오리진에서 자바스크립트를
/// 돌릴 수 있게만 한다(1.x 가 실제로 이 스킴으로 뭘 서빙했는지는 중요하지 않다 — localStorage 는 문서
/// 내용과 무관하게 오리진에만 묶여 있다).
private final class EmptyDocSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let html = "<!doctype html><html><body></body></html>".data(using: .utf8)!
        guard let url = urlSchemeTask.request.url else { urlSchemeTask.didFailWithError(URLError(.badURL)); return }
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: html.count, textEncodingName: "utf-8")
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(html)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

/// 실행 중인 러너를 붙잡아 둔다 — `start()` 호출부가 지역 변수만 들고 있으면 그 스코프가 끝나자마자
/// ARC 가 회수해 버려서(딜리게이트도 약한 참조) 네비게이션이 끝나기도 전에 콜백이 증발한다(실제로 5주차에
/// 이 버그로 `debugSeedAndVerify()` 가 영원히 안 끝나는 걸 발견했다 — continuation 이 결코 resume 되지
/// 않아 조용히 멈췄다, 크래시도 로그도 없이). `finish()` 가 스스로 이 배열에서 자신을 빼면서 해제된다.
@MainActor
private var activeLegacyRunners: [LegacyWebViewRunner] = []

/// 실제 WKWebView 인스턴스 생명주기 보유자. `evaluateJavaScript` 가 끝날 때까지 강한 참조를 유지해야 해서
/// 클로저 캡처만으로는 부족해 별도 객체로 뺐다.
@MainActor
private final class LegacyWebViewRunner: NSObject, WKNavigationDelegate {
    private let key: String
    private let writeValue: String?
    private let onString: ((String?) -> Void)?
    private let onBool: ((Bool) -> Void)?
    private var webView: WKWebView?
    private let schemeHandler = EmptyDocSchemeHandler()
    private var finished = false

    /// 읽기 전용.
    init(key: String, completion: @escaping (String?) -> Void) {
        self.key = key
        self.writeValue = nil
        self.onString = completion
        self.onBool = nil
    }

    /// DEBUG 전용 쓰기 검증 경로.
    init(writeKey: String, writeValue: String, completion: @escaping (Bool) -> Void) {
        self.key = writeKey
        self.writeValue = writeValue
        self.onString = nil
        self.onBool = completion
    }

    func start() {
        activeLegacyRunners.append(self)
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "rimikimi")
        // 명시적으로 기본(영구) 저장소 — 1.x(Capacitor) 가 별도 설정 없이 쓰던 것과 같은 저장소.
        config.websiteDataStore = .default()
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        webView = wv
        // JS 타이머/평가가 확실히 돌도록 키 윈도우에 잠깐 붙인다(화면엔 보이지 않음, 크기 0).
        if let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first {
            window.addSubview(wv)
        }
        wv.load(URLRequest(url: URL(string: "rimikimi://localhost/")!))
        // 네트워크가 전혀 없는 스킴이라 즉시 끝나야 정상이지만, 혹시 몰라 타임아웃을 둔다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.finish(string: nil, bool: false) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let writeValue {
            let escaped = writeValue.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
            webView.evaluateJavaScript("window.localStorage.setItem(\"\(key)\", \"\(escaped)\"); true") { [weak self] result, _ in
                self?.finish(string: nil, bool: (result as? Bool) ?? false)
            }
        } else {
            webView.evaluateJavaScript("window.localStorage.getItem(\"\(key)\")") { [weak self] result, _ in
                self?.finish(string: result as? String, bool: false)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(string: nil, bool: false) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(string: nil, bool: false) }

    private func finish(string: String?, bool: Bool) {
        guard !finished else { return }
        finished = true
        webView?.removeFromSuperview()
        webView = nil
        onString?(string)
        onBool?(bool)
        activeLegacyRunners.removeAll { $0 === self }
    }
}
