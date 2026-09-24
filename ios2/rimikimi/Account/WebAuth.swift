import Foundation
import AuthenticationServices
import UIKit

/// `ASWebAuthenticationSession` — 카카오·네이버·Google(그리고 Apple 폴백). 딥링크로 돌아온 URL 을 돌려준다.
/// 웹뷰 안에서는 Google/Apple 이 로그인을 막으므로(403 disallowed_useragent) 반드시 이걸 쓴다.
@MainActor
enum WebAuth {
    enum Failure: Error, Equatable { case cancelled, failed(String) }

    private static var current: ASWebAuthenticationSession?
    private static let context = Context()

    static func run(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                current = nil
                if let error {
                    if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { cont.resume(throwing: Failure.cancelled) }
                    else { cont.resume(throwing: Failure.failed(error.localizedDescription)) }
                    return
                }
                guard let callback else { cont.resume(throwing: Failure.failed(Copy.loginNoResponse)); return }
                cont.resume(returning: callback)
            }
            session.presentationContextProvider = context
            // 카카오·구글 쿠키를 같이 쓰게 둔다 — 매번 비밀번호를 다시 치게 하지 않는다.
            session.prefersEphemeralWebBrowserSession = false
            current = session
            if !session.start() { cont.resume(throwing: Failure.failed(Copy.loginStartFailed)) }
        }
    }

    private final class Context: NSObject, ASWebAuthenticationPresentationContextProviding {
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            MainActor.assumeIsolated { WindowFinder.keyWindow ?? ASPresentationAnchor() }
        }
    }
}
