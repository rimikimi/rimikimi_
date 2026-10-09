import Foundation
import Security

/// 게스트 첫 1장용 기기 ID — 키체인에 둔 UUID(앱을 지웠다 깔아도 같은 값). 서버는 해시로만 저장한다(api/_lib/guestFirst.js).
enum GuestDevice {
    private static let service = "com.rimikimi.app.guest"
    private static let account = "deviceId"
    static var id: String {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var r: CFTypeRef?
        if SecItemCopyMatching(q as CFDictionary, &r) == errSecSuccess, let d = r as? Data, let s = String(data: d, encoding: .utf8) { return s }
        let new = UUID().uuidString
        let add: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                  kSecAttrAccount as String: account, kSecValueData as String: Data(new.utf8),
                                  kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(add as CFDictionary, nil)
        return new
    }
    /// 이 기기가 첫 1장을 이미 썼는지(서버가 최종 판정 — 이건 화면 분기용).
    static var used: Bool {
        get { UserDefaults.standard.bool(forKey: "guest.firstUsed") }
        set { UserDefaults.standard.set(newValue, forKey: "guest.firstUsed") }
    }
}
