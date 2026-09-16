import Foundation
import Security

/// Supabase 세션. 키체인에 둔다 — UserDefaults 는 백업으로 새고, 앱을 지우면 같이 사라진다.
struct AuthSession: Codable, Equatable {
    var accessToken: String
    var refreshToken: String?
    var userID: String
    var email: String?
    var displayName: String?
    var avatarURL: URL?
    var provider: String?

    /// JWT `exp` 를 보고 1분 안에 만료되면 참. 서명은 검증하지 않는다 — 시각만 본다.
    var isExpiringSoon: Bool { Self.isExpiringSoon(accessToken) }

    static func isExpiringSoon(_ jwt: String, slack: TimeInterval = 60) -> Bool {
        guard let exp = payload(of: jwt)?["exp"] as? Double else { return true }
        return Date(timeIntervalSince1970: exp).timeIntervalSinceNow <= slack
    }

    static func payload(of jwt: String) -> [String: Any]? {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    /// 토큰 응답(`/auth/v1/token`, 딥링크 fragment)에서 세션을 만든다. 사용자 정보는 JWT 클레임에서 읽는다.
    static func from(accessToken: String, refreshToken: String?) -> AuthSession? {
        guard let p = payload(of: accessToken), let sub = p["sub"] as? String else { return nil }
        let meta = p["user_metadata"] as? [String: Any] ?? [:]
        let appMeta = p["app_metadata"] as? [String: Any] ?? [:]
        let name = (meta["full_name"] as? String) ?? (meta["name"] as? String) ?? (meta["preferred_username"] as? String)
        let avatar = (meta["avatar_url"] as? String) ?? (meta["picture"] as? String)
        return AuthSession(accessToken: accessToken, refreshToken: refreshToken, userID: sub,
                           email: p["email"] as? String, displayName: name,
                           avatarURL: avatar.flatMap { URL(string: $0) },
                           provider: appMeta["provider"] as? String)
    }
}

/// 키체인 — 서비스 `com.rimikimi.app`, 계정 `supabase_session`.
///
/// 서명 없는 시뮬레이터 빌드(`CODE_SIGNING_ALLOWED=NO`)에서는 `SecItemAdd` 가 -34018(entitlement 없음)로
/// 실패해 재실행하면 로그아웃돼 있었다(2026-09-16 E2E 에서 발견). 키체인이 거부하면 앱 전용 보호 파일에
/// 둔다 — 실기기·서명 빌드에서는 키체인이 정본이다.
struct SessionKeychain {
    private let service = Config.bundleID
    private let key = "supabase_session"

    func read() -> AuthSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
           let s = try? JSONDecoder().decode(AuthSession.self, from: data) {
            return s
        }
        guard let data = try? Data(contentsOf: fallbackURL) else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    func write(_ session: AuthSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        clear()
        let insert: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemAdd(insert as CFDictionary, nil)
        if status != errSecSuccess {
            AppLog.auth.error("keychain.write.failed status=\(status) → file fallback")
            try? data.write(to: fallbackURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    func clear() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ] as CFDictionary)
        try? FileManager.default.removeItem(at: fallbackURL)
    }

    private var fallbackURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("rimikimi", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("session.json")
    }
}
