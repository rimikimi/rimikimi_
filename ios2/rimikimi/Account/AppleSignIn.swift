import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/// Sign in with Apple 네이티브 시트. Supabase 에 넘길 `id_token` 과 원본 nonce 를 돌려준다.
/// (요청에는 SHA-256 nonce 를, 교환에는 원본 nonce 를 보낸다 — Supabase 가 대조한다.)
@MainActor
final class AppleSignIn: NSObject {
    struct Credential { let idToken: String; let rawNonce: String; let fullName: PersonNameComponents?; let email: String? }
    enum Failure: Error, Equatable { case cancelled, noToken, failed(String) }

    private var continuation: CheckedContinuation<Credential, Error>?
    private var rawNonce = ""

    func request() async throws -> Credential {
        rawNonce = Self.randomNonce()
        let req = ASAuthorizationAppleIDProvider().createRequest()
        req.requestedScopes = [.fullName, .email]
        req.nonce = Self.sha256(rawNonce)
        let controller = ASAuthorizationController(authorizationRequests: [req])
        controller.delegate = self
        controller.presentationContextProvider = self
        return try await withCheckedThrowingContinuation { cont in
            continuation = cont
            controller.performRequests()
        }
    }

    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

extension AppleSignIn: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
            continuation?.resume(throwing: Failure.noToken); continuation = nil; return
        }
        continuation?.resume(returning: Credential(idToken: token, rawNonce: rawNonce, fullName: cred.fullName, email: cred.email))
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled { continuation?.resume(throwing: Failure.cancelled) }
        else { continuation?.resume(throwing: Failure.failed(error.localizedDescription)) }
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        WindowFinder.keyWindow ?? ASPresentationAnchor()
    }
}

@MainActor
enum WindowFinder {
    static var keyWindow: UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }
}
