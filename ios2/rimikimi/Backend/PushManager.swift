import Foundation
import Observation
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

/// 원격 푸시(FCM) — 1.x `src/push.js` 와 같은 설계: **등록 API 없음.**
/// - "생성 완료" 알림: 생성 요청에 `pushToken` 을 실어 보내면 서버가 그 기기에만 쏜다(`api/_lib/push.js`).
/// - "새 컨셉 드롭" 알림: 토픽 `drop_p540`(UTC+9) 구독. 서버 `api/_lib/dropNotice.js` 와 규칙이 같다.
/// 알림 **권한은 프로필의 "새 컨셉 알림 켜기" 토글에서만** 묻는다(SPEC §3). 앱 활성화 시 배지 0.
@MainActor
@Observable
final class PushManager: NSObject {
    static let shared = PushManager()

    private(set) var fcmToken: String?
    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    /// 사용자가 켠 "새 컨셉 알림" — UserDefaults.
    private(set) var newConceptAlerts: Bool = UserDefaults.standard.bool(forKey: "push.newConcept.v1")
    /// 알림을 탭해서 앱이 열렸을 때의 `data.kind`("genDone" 등). `RootTabView` 가 지켜보다 결과 화면을 연다.
    private(set) var pendingTapKind: String?
    /// 완료 알림 payload 의 `galleryId`(4주차, 서버가 추가하면 도착) — 있으면 정확한 결과를, 없으면(구버전 서버·
    /// 이미 깔린 앱) `pendingTapKind` 만 보고 최신 갤러리 항목으로 폴백한다.
    private(set) var pendingGalleryId: String?

    private var configured = false
    @ObservationIgnored private var topicSync: Task<Void, Never>?

    /// 앱 시작 — Firebase 만 설정한다. 권한은 묻지 않는다.
    func configureAtLaunch() {
        guard !configured else { return }
        guard Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil else {
            AppLog.ui.error("push: GoogleService-Info.plist 없음"); return
        }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        configured = true
        Task { await refreshAuthorization() }
        // 알림을 켜 둔 사용자는 앱 언어에 맞는 드롭 토픽으로 맞춘다(언어를 바꿨거나 2.0.1 에서 올라온 영어 사용자).
        syncDropTopic()
    }

    /// 알림을 켜 둔 사용자의 드롭 토픽을 **지금 앱 언어** 쪽으로 맞춘다 — 실행 때, 그리고 프로필에서 언어를 바꿨을 때.
    /// 앞 작업이 끝난 뒤에 돌린다: 언어를 빠르게 두 번 바꾸면 구독·해지가 엇갈려 두 토픽이 다 끊길 수 있다.
    func syncDropTopic() {
        guard configured, newConceptAlerts else { return }
        let previous = topicSync
        topicSync = Task {
            await previous?.value
            guard newConceptAlerts else { return } // 기다리는 사이 알림을 껐으면 다시 구독하지 않는다
            let ko = L.ko
            try? await Messaging.messaging().subscribe(toTopic: Self.topic(ko: ko))
            try? await Messaging.messaging().unsubscribe(fromTopic: Self.topic(ko: !ko))
        }
    }

    func refreshAuthorization() async {
        authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if authorization == .authorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// 프로필 토글 → 여기서만 권한을 묻는다.
    func setNewConceptAlerts(_ on: Bool) async {
        if on {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            await refreshAuthorization()
            guard granted else { newConceptAlerts = false; UserDefaults.standard.set(false, forKey: "push.newConcept.v1"); return }
            UIApplication.shared.registerForRemoteNotifications()
            try? await Messaging.messaging().subscribe(toTopic: Self.dropTopic)
            // 기기 언어를 바꿨으면 반대 언어 토픽은 끊는다(두 번 받지 않게)
            try? await Messaging.messaging().unsubscribe(fromTopic: Self.topic(ko: !L.ko))
        } else {
            try? await Messaging.messaging().unsubscribe(fromTopic: Self.topic(ko: true))
            try? await Messaging.messaging().unsubscribe(fromTopic: Self.topic(ko: false))
        }
        newConceptAlerts = on
        UserDefaults.standard.set(on, forKey: "push.newConcept.v1")
        HapticPlayer.selection()
    }

    /// 첫 생성 때 한 번 — 알림 권한을 아직 안 물었으면 묻는다(오너 2026-10-10 "왜 푸시알림 안 옴": 2.x 는 설정 토글을
    /// 켜야만 물어서, 대부분 사용자가 완료·새 컨셉 알림을 하나도 못 받았다). 허용하면 새 컨셉 알림도 같이 켠다.
    /// 완료 알림은 이번 요청에 실릴 FCM 토큰이 필요하니 토큰을 잠깐(최대 3초) 기다린다.
    func askOnFirstGenerate() async {
        guard configured else { return }
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        guard status == .notDetermined else { return }
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        await refreshAuthorization()
        guard granted else { return }
        UIApplication.shared.registerForRemoteNotifications()
        newConceptAlerts = true
        UserDefaults.standard.set(true, forKey: "push.newConcept.v1")
        syncDropTopic()
        for _ in 0..<15 where fcmToken == nil {
            if let t = try? await Messaging.messaging().token() { fcmToken = t; break }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
    }

    /// `drop_p540` = UTC+9. 서버 규칙과 동일. 영어 기기는 `drop_p540_en`(서버가 영어 문구로 보냄).
    static var dropTopic: String { topic(ko: L.ko) }
    static func topic(ko: Bool) -> String {
        let off = TimeZone.current.secondsFromGMT() / 60
        return "drop_\(off < 0 ? "m" : "p")\(abs(off))\(ko ? "" : "_en")"
    }

    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0)
    }

    /// `RootTabView.onChange` 가 처리한 뒤 되돌린다.
    func clearTapKind() { pendingTapKind = nil; pendingGalleryId = nil }

    #if DEBUG
    /// 시뮬레이터엔 알림 배너를 탭할 방법이 없다 — dev 라우트가 이 경로를 대신 태운다.
    func simulateTap(kind: String, galleryId: String? = nil) { pendingGalleryId = galleryId; pendingTapKind = kind }
    #endif

    // MARK: AppDelegate 브리지

    func didRegister(deviceToken: Data) {
        guard configured else { return }
        Messaging.messaging().apnsToken = deviceToken
        Task {
            if let t = try? await Messaging.messaging().token() { fcmToken = t }
        }
    }

    func didFailToRegister(_ error: Error) {
        AppLog.ui.error("push.register.failed \(error.localizedDescription, privacy: .public)")
    }
}

extension PushManager: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in self.fcmToken = fcmToken }
    }
}

extension PushManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// 알림 탭(포그라운드/백그라운드/콜드 스타트 전부 이 한 델리게이트로 온다).
    /// "생성 완료" 알림(`api/generate.js` notifyDone, `data.kind == "genDone"`)만 결과 화면으로 연다.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let kind = info["kind"] as? String else { return }
        // galleryId 는 숫자·문자열이 섞여 올 수 있다(다른 서버 응답과 동일).
        let galleryId: String? = (info["galleryId"] as? String) ?? (info["galleryId"] as? NSNumber)?.stringValue
        await MainActor.run {
            PushManager.shared.pendingGalleryId = galleryId
            PushManager.shared.pendingTapKind = kind
        }
    }
}
