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
/// **build 90 실기기 결함 수정(오너 지시)**: 예전 구현은 시도 "전에" `attemptedFlag` 를 찍었다 — 앱
/// 시작 `.task` 시점엔 `UIApplication.shared.connectedScenes...keyWindow` 가 아직 준비되지 않아
/// 숨은 WKWebView 가 창에 못 붙는 경우가 실기기에서 실제로 있었고, 그러면 JS 평가가 안 돌아 3초
/// 타임아웃으로 빠지는데 그 애매한 실패에도 플래그가 이미 찍혀 있어 **영원히 재시도하지 않았다**.
/// 지금은 "확정적 결과"(성공적으로 세션까지 교환했음 / 웹뷰가 제대로 로드돼 JS 도 돌았는데 값이
/// 정말 없음·파싱 불가)일 때만 플래그를 찍고, 창 없음·웹뷰 로드 실패·타임아웃 같은 애매한 실패는
/// 플래그를 찍지 않아 다음 실행에 다시 시도한다. 무한 재시도를 막기 위해 최대 시도 횟수를 둔다.
@MainActor
enum LegacySessionMigration {
    /// 1.x 가 실제로 쓴 값. `capacitor.config.ts`(`ios.scheme`) + `src/supabaseClient.js`(스토리지 미지정
    /// → `@supabase/supabase-js` 기본 `sb-<host 첫 라벨>-auth-token`) 로 역산.
    static let legacyOrigin = "rimikimi://localhost"
    static let storageKey = "sb-hedgjzdrivilclmwumoc-auth-token"

    /// 확정적 결과가 나왔을 때만 찍는다(더 이상 재시도하지 않아도 되는 상태).
    private static let attemptedFlag = "legacyMigration.attempted.v1"
    /// 애매한 실패(창 없음/로드 실패/타임아웃) 횟수 — 무한 재시도 방지용 상한.
    private static let ambiguousCountKey = "legacyMigration.ambiguousCount.v1"
    private static let maxAmbiguousAttempts = 5

    /// 앱 시작 시: 이미 로그인돼 있거나 이미 확정된 결과가 있으면 즉시 반환. 성공하면 true.
    /// 애매한 실패는 플래그를 찍지 않고 그대로 반환 — 다음 실행에서 다시 호출된다.
    @discardableResult
    static func attemptOnce() async -> Bool {
        guard !AuthStore.shared.isSignedIn else { return false }
        guard !UserDefaults.standard.bool(forKey: attemptedFlag) else { return false }

        let ambiguousCount = UserDefaults.standard.integer(forKey: ambiguousCountKey)
        guard ambiguousCount < maxAmbiguousAttempts else {
            AppLog.auth.notice("legacy.migration.giveup ambiguousCount=\(ambiguousCount, privacy: .public)")
            UserDefaults.standard.set(true, forKey: attemptedFlag)
            return false
        }

        AppLog.auth.info("legacy.migration.start ambiguousCount=\(ambiguousCount, privacy: .public)")
        let outcome = await readLegacyLocalStorage(key: storageKey)

        switch outcome {
        case .ambiguous(let reason):
            UserDefaults.standard.set(ambiguousCount + 1, forKey: ambiguousCountKey)
            AppLog.auth.notice("legacy.migration.ambiguous reason=\(reason, privacy: .public) willRetryNextLaunch=true")
            return false

        case .definitiveEmpty:
            AppLog.auth.info("legacy.migration.none")
            UserDefaults.standard.set(true, forKey: attemptedFlag)
            return false

        case .value(let raw):
            AppLog.auth.info("legacy.migration.value.found len=\(raw.count, privacy: .public)")
            guard let refreshToken = Self.refreshToken(fromRawValue: raw) else {
                AppLog.auth.notice("legacy.migration.unparseable")
                UserDefaults.standard.set(true, forKey: attemptedFlag)
                return false
            }
            AppLog.auth.info("legacy.migration.token.parsed len=\(refreshToken.count, privacy: .public)")
            let ok = await AuthStore.shared.adoptLegacyRefreshToken(refreshToken)
            AppLog.auth.info("legacy.migration.exchange.result ok=\(ok, privacy: .public)")
            // 성공/실패(파싱된 토큰으로 교환까지 시도) 모두 확정적 결과 — 재시도해도 값이 안 바뀐다.
            UserDefaults.standard.set(true, forKey: attemptedFlag)
            return ok
        }
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
    private static func readLegacyLocalStorage(key: String) async -> LegacyReadOutcome {
        await withCheckedContinuation { continuation in
            let runner = LegacyWebViewRunner(key: key) { outcome in
                continuation.resume(returning: outcome)
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
        switch readBack {
        case .value(let raw) where raw == fakeSession:
            return "성공 — 같은 오리진(\(legacyOrigin))의 영구 저장소에 쓰고 다시 읽었다: \(raw)"
        case .value(let raw):
            return "실패 — 쓴 값과 읽은 값이 다름: \(raw)"
        case .definitiveEmpty:
            return "실패 — 다시 읽었더니 비어 있음"
        case .ambiguous(let reason):
            return "실패(애매함) — \(reason)"
        }
    }

    /// 재시도 카운터/확정 플래그를 초기화 — 개발용(`dev/legacymigration?reset=1`).
    static func debugResetFlags() {
        UserDefaults.standard.removeObject(forKey: attemptedFlag)
        UserDefaults.standard.removeObject(forKey: ambiguousCountKey)
    }
    #endif
}

/// 숨은 WKWebView 읽기 시도의 결과. "확정적"(더 재시도해도 결과가 안 바뀜) vs "애매함"(환경 문제로
/// 실제로 값을 확인 못 했음 — 다음 실행에 다시 시도해야 함)을 구분한다.
enum LegacyReadOutcome {
    /// 웹뷰가 정상적으로 로드되고 JS 평가까지 끝났고, 값이 있었다.
    case value(String)
    /// 웹뷰가 정상적으로 로드되고 JS 평가까지 끝났는데, 키에 값이 정말 없었다(1.x 데이터가 없는 게 정상 —
    /// 새 설치 등).
    case definitiveEmpty
    /// 창을 못 찾았거나, 웹뷰 로드가 실패했거나, 타임아웃이 걸렸거나 — 실제로 값을 확인하지 못했다.
    case ambiguous(String)
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
    private let onOutcome: ((LegacyReadOutcome) -> Void)?
    private let onBool: ((Bool) -> Void)?
    private var webView: WKWebView?
    private let schemeHandler = EmptyDocSchemeHandler()
    private var finished = false
    /// 창을 기다리는 동안의 폴링 횟수(최대 ~2초: 20 * 0.1s).
    private var windowWaitTicks = 0
    private let maxWindowWaitTicks = 20

    /// 읽기 전용.
    init(key: String, completion: @escaping (LegacyReadOutcome) -> Void) {
        self.key = key
        self.writeValue = nil
        self.onOutcome = completion
        self.onBool = nil
    }

    /// DEBUG 전용 쓰기 검증 경로.
    init(writeKey: String, writeValue: String, completion: @escaping (Bool) -> Void) {
        self.key = writeKey
        self.writeValue = writeValue
        self.onOutcome = nil
        self.onBool = completion
    }

    func start() {
        activeLegacyRunners.append(self)
        attachToWindowThenLoad()
    }

    /// 앱 시작 `.task` 시점엔 `keyWindow` 가 아직 없을 수 있다(실기기에서 실제로 관측된 애매한 실패
    /// 원인) — 즉시 포기하지 않고 잠깐 폴링하며 기다린다. 그래도 못 찾으면 애매한 실패로 처리해
    /// 다음 실행에 재시도되게 한다(값을 확인 못 했다는 뜻이지, "값이 없다"는 뜻이 아니다).
    private func attachToWindowThenLoad() {
        guard !finished else { return }
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else {
            windowWaitTicks += 1
            guard windowWaitTicks <= maxWindowWaitTicks else {
                AppLog.auth.notice("legacy.migration.step window.notFound afterTicks=\(self.windowWaitTicks, privacy: .public)")
                finish(.ambiguous("noWindow"))
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.attachToWindowThenLoad() }
            return
        }

        AppLog.auth.info("legacy.migration.step window.attached afterTicks=\(self.windowWaitTicks, privacy: .public)")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "rimikimi")
        // 명시적으로 기본(영구) 저장소 — 1.x(Capacitor) 가 별도 설정 없이 쓰던 것과 같은 저장소.
        config.websiteDataStore = .default()
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        webView = wv
        // JS 타이머/평가가 확실히 돌도록 키 윈도우에 잠깐 붙인다(화면엔 보이지 않음, 크기 0).
        window.addSubview(wv)
        wv.load(URLRequest(url: URL(string: "rimikimi://localhost/")!))
        // 네트워크가 전혀 없는 스킴이라 즉시 끝나야 정상이지만, 혹시 몰라 타임아웃을 둔다.
        // 타임아웃은 "확인 못 함"이지 "값이 없음"이 아니므로 애매한 실패로 처리한다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, !self.finished else { return }
            AppLog.auth.notice("legacy.migration.step timeout")
            self.finish(.ambiguous("timeout"))
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        AppLog.auth.info("legacy.migration.step webview.didFinish")
        if let writeValue {
            let escaped = writeValue.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
            webView.evaluateJavaScript("window.localStorage.setItem(\"\(key)\", \"\(escaped)\"); true") { [weak self] result, error in
                if let error {
                    AppLog.auth.notice("legacy.migration.step js.error(write) \(error.localizedDescription, privacy: .public)")
                    self?.finish(.ambiguous("jsWriteError"), boolOverride: false)
                    return
                }
                self?.finish(.definitiveEmpty, boolOverride: (result as? Bool) ?? false)
            }
        } else {
            webView.evaluateJavaScript("window.localStorage.getItem(\"\(key)\")") { [weak self] result, error in
                if let error {
                    AppLog.auth.notice("legacy.migration.step js.error(read) \(error.localizedDescription, privacy: .public)")
                    self?.finish(.ambiguous("jsReadError"))
                    return
                }
                if let value = result as? String {
                    AppLog.auth.info("legacy.migration.step js.result present len=\(value.count, privacy: .public)")
                    self?.finish(.value(value))
                } else {
                    // JS 는 정상적으로 돌았고(에러 없음) 결과가 nil/NSNull — 키에 값이 정말 없다는 확정적 결과.
                    AppLog.auth.info("legacy.migration.step js.result absent")
                    self?.finish(.definitiveEmpty)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        AppLog.auth.notice("legacy.migration.step nav.didFail \(error.localizedDescription, privacy: .public)")
        finish(.ambiguous("navFailed"))
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        AppLog.auth.notice("legacy.migration.step nav.didFailProvisional \(error.localizedDescription, privacy: .public)")
        finish(.ambiguous("navFailedProvisional"))
    }

    /// 공통 종료 지점. 읽기 경로면 `onOutcome`, 쓰기 경로면 `onBool`(성공 여부는 `boolOverride`,
    /// 없으면 outcome 이 `.value`/`.definitiveEmpty` 인지로 판단)을 호출한다. 타임아웃/네비게이션 실패처럼
    /// 두 경로 모두에서 걸릴 수 있는 지점이 있어 하나로 합쳤다 — 쓰기 경로에서 타임아웃이 나도 `onBool` 이
    /// 반드시 호출돼야 `debugSeedAndVerify()` 의 continuation 이 멈추지 않는다.
    private func finish(_ outcome: LegacyReadOutcome, boolOverride: Bool? = nil) {
        guard !finished else { return }
        finished = true
        webView?.removeFromSuperview()
        webView = nil
        if let onOutcome {
            onOutcome(outcome)
        } else {
            let ok: Bool
            if let boolOverride {
                ok = boolOverride
            } else if case .value = outcome {
                ok = true
            } else {
                ok = false
            }
            onBool?(ok)
        }
        activeLegacyRunners.removeAll { $0 === self }
    }
}
