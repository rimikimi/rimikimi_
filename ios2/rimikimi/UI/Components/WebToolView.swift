import SwiftUI
import WebKit
import Photos
import UIKit

/// 편집기·카메라 웹뷰(SPEC §5 1단계) + 네이티브 브리지.
///
/// 웹 → 네이티브: `window.webkit.messageHandlers.rimikimi.postMessage({id, type, payload})`
///   - "ready"          웹이 뜨면 1회. 응답으로 `window.__rimikimiInit(payload)` 를 호출해 초기 데이터를 준다.
///   - "saveToAlbum"    payload.dataUrl(base64) → PHPhotoLibrary 저장.
///   - "share"          payload.dataUrl(base64) → UIActivityViewController.
///   - "close"          웹뷰 닫기(네이티브 "다듬기·공유" 화면으로 되돌아간다는 뜻이 아니라, 이 화면 자체를 닫음).
///   - "refreshCredits" 생성/구매 등으로 크레딧이 바뀌었을 수 있으니 `/api/quota` 갱신 요청.
/// 네이티브 → 웹 응답: `window.__rimikimiResolve(id, result)`.
/// 웹 쪽 대응은 `src/nativeBridge.js` 의 `isRimikimiWebView()`/`wkCall` — 1.x 가 Capacitor 로 부르던
/// `nativeSaveToAlbum`/`nativeShare`/`nativeShareImage` 와 같은 반환 모양(`{ok}` / `{error}`)을 맞췄다.
final class WebBridgeCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    /// 카메라 도구는 우리 배포 origin 만 로드하고, 카메라 열기 자체가 이미 로그인 게이트 뒤에
    /// 있다(SPEC §3) — 1.x 가 Capacitor 웹뷰에서 카메라 요청을 프롬프트 없이 그대로 승인하던 것과
    /// 같은 이유로 여기서도 자동 승인한다. iOS 시스템 카메라 권한(Info.plist)은 그대로 받는다.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        for delay in [0.0, 1.0, 3.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak webView] in
                webView?.evaluateJavaScript("(document.getElementById('root') ? document.getElementById('root').outerHTML : 'NO ROOT').slice(0,500) + '|errs=' + JSON.stringify(window.__rimikimiErrors || [])") { result, error in
                    AppLog.ui.info("webtool.loaded+\(delay, privacy: .public) \(String(describing: result), privacy: .public) err=\(String(describing: error), privacy: .public)")
                }
            }
        }
        #endif
    }

    weak var webView: WKWebView?
    var initialPayload: [String: Any]?
    var onClose: (() -> Void)?
    var onRefreshCredits: (() -> Void)?
    var onSaved: (() -> Void)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        let id = body["id"] as? String
        let payload = body["payload"] as? [String: Any]
        switch type {
        case "ready": sendInit()
        case "saveToAlbum": saveToAlbum(payload: payload, id: id)
        case "share": share(payload: payload, id: id)
        case "close": onClose?()
        case "refreshCredits": onRefreshCredits?(); resolve(id, ["ok": true])
        default: break
        }
    }

    private func sendInit() {
        let payload = initialPayload ?? [:]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.__rimikimiInit && window.__rimikimiInit(\(json))")
        }
    }

    private func resolve(_ id: String?, _ result: [String: Any]) {
        guard let id, let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.__rimikimiResolve && window.__rimikimiResolve('\(id)', \(json))")
        }
    }

    private func decodeImage(_ dataUrl: String) -> UIImage? {
        let parts = dataUrl.split(separator: ",", maxSplits: 1)
        guard let b64 = parts.last, let data = Data(base64Encoded: String(b64)) else { return nil }
        return UIImage(data: data)
    }

    private func saveToAlbum(payload: [String: Any]?, id: String?) {
        guard let dataUrl = payload?["dataUrl"] as? String, let img = decodeImage(dataUrl) else {
            resolve(id, ["error": "decode failed"]); return
        }
        Task { [weak self] in
            guard let self else { return }
            do {
                try await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.creationRequestForAsset(from: img) }
                await MainActor.run { self.onSaved?() }
                self.resolve(id, ["ok": true])
            } catch {
                self.resolve(id, ["error": error.localizedDescription])
            }
        }
    }

    private func share(payload: [String: Any]?, id: String?) {
        guard let dataUrl = payload?["dataUrl"] as? String, let img = decodeImage(dataUrl) else {
            resolve(id, ["ok": false, "reason": "decode failed"]); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let root = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
                .first?.rootViewController else {
                self.resolve(id, ["ok": false, "reason": "no window"]); return
            }
            var top = root
            while let presented = top.presentedViewController { top = presented }
            let av = UIActivityViewController(activityItems: [img], applicationActivities: nil)
            av.completionWithItemsHandler = { [weak self] _, completed, _, _ in
                self?.resolve(id, ["ok": completed])
            }
            top.present(av, animated: true)
        }
    }
}

struct WebToolView: UIViewRepresentable {
    var url: URL
    var initialPayload: [String: Any]?
    var onClose: () -> Void
    var onRefreshCredits: () -> Void
    var onSaved: () -> Void

    func makeCoordinator() -> WebBridgeCoordinator {
        let c = WebBridgeCoordinator()
        c.initialPayload = initialPayload
        c.onClose = onClose
        c.onRefreshCredits = onRefreshCredits
        c.onSaved = onSaved
        return c
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "rimikimi")
        #if DEBUG
        let errScript = WKUserScript(
            source: "window.__rimikimiErrors = []; " +
                "window.addEventListener('error', e => window.__rimikimiErrors.push((e.message||String(e))+'@'+e.filename+':'+e.lineno)); " +
                "window.addEventListener('unhandledrejection', e => window.__rimikimiErrors.push('promise:'+String(e.reason)));",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(errScript)
        #endif
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.webView = view
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: WebBridgeCoordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "rimikimi")
    }
}

struct WebToolScreen: View {
    var url: URL
    var title: String
    /// 편집기에 미리 실어 보낼 사진("다듬기") — `src/ToolEntry.jsx` 의 `window.__rimikimiInit` 로 도착.
    var initialPayload: [String: Any]? = nil
    /// 상단바 없이 전체 화면(카메라). 닫기는 웹 버튼 → `close` 브리지가 처리한다.
    var chromeless: Bool = false
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    private var web: some View {
        WebToolView(
            url: url,
            initialPayload: initialPayload,
            onClose: { dismiss() },
            onRefreshCredits: { Task { await app.refreshQuota() } },
            onSaved: { HapticPlayer.success(); app.showToast("사진첩에 저장됐어요") }
        )
    }

    var body: some View {
        if chromeless {
            // 아이폰 기본 카메라처럼 — 상단바 없이 화면을 통째로 쓴다(오너 지시).
            web
                .ignoresSafeArea()
                .background(Color.black)
        } else {
            NavigationStack {
                web
                    .ignoresSafeArea(edges: .bottom)
                    .background(Color.bg)
                    .inlineTitle(title)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("닫기") { dismiss() }
                        }
                    }
            }
        }
    }
}
