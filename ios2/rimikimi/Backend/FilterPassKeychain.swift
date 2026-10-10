import Foundation
import Security

/// 필터 이용권 "처음 3일" 시작 시각 — 키체인(앱을 지웠다 깔아도 남는다, 계약서 `filterpass_spec.md`).
/// `GuestDevice` 와 같은 방식. 서명 없는 시뮬레이터 빌드는 키체인이 -34018 로 거부하므로
/// `SessionKeychain` 처럼 앱 전용 파일에 대신 둔다(실기기·서명 빌드에서는 키체인이 정본).
enum FilterPassKeychain {
    private static let service = "com.rimikimi.app.filterpass"
    private static let account = "trialStart"

    static func readTrialStart() -> Date? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: account, kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        var r: CFTypeRef?
        if SecItemCopyMatching(q as CFDictionary, &r) == errSecSuccess, let d = r as? Data,
           let s = String(data: d, encoding: .utf8), let t = TimeInterval(s) {
            return Date(timeIntervalSince1970: t)
        }
        if let d = try? Data(contentsOf: fallbackURL), let s = String(data: d, encoding: .utf8), let t = TimeInterval(s) {
            return Date(timeIntervalSince1970: t)
        }
        return nil
    }

    static func writeTrialStart(_ date: Date) {
        let data = Data(String(date.timeIntervalSince1970).utf8)
        let add: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                  kSecAttrAccount as String: account, kSecValueData as String: data,
                                  kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemAdd(add as CFDictionary, nil)
        if status != errSecSuccess {
            AppLog.api.notice("filterpass.keychain.write.failed status=\(status) → file fallback")
            try? data.write(to: fallbackURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    #if DEBUG
    static func debugClear() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                       kSecAttrAccount as String: account] as CFDictionary)
        try? FileManager.default.removeItem(at: fallbackURL)
    }
    #endif

    private static var fallbackURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("rimikimi", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("filterpass.trial")
    }
}
