import SwiftUI
import UIKit

@main
struct RimikimiApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(app)
                .tint(Color.accent)
                .preferredColorScheme(nil)
                .task {
                    // 실행 시 팝업 없음 — Firebase 설정만, 권한은 프로필 토글에서.
                    app.push.configureAtLaunch()
                    // 전면광고 SDK 초기화 + 첫 광고 미리 로드. 팝업은 안 뜬다(ATT 는 TrackingPrompt 소유).
                    // 여기서 미리 받아 둬야 생성이 끝난 순간 기다림 없이 띄울 수 있다.
                    AdManager.shared.start()
                    // 5주차: 아직 로그인 안 된 상태면 1.x WKWebView localStorage 에서 세션을 건질 수
                    // 있는지 1회 시도한다(LegacySessionMigration). 실패해도 부작용 없음 — 평소처럼 로그인 시트.
                    await LegacySessionMigration.attemptOnce()
                    app.store.configure(userID: app.auth.session?.userID)
                    await app.concepts.load()
                    app.generation.resumeIfNeeded()
                    await app.refreshQuota()
                    if let uid = app.auth.session?.userID { await app.store.logIn(userID: uid) }
                    #if DEBUG
                    DevRoutes.handleLaunchArguments(app: app)
                    #endif
                }
                // 로그인 완료 → 하던 동작 재개.
                .onChange(of: app.auth.signInTick) { _, _ in app.resumePending() }
                // 외부 브라우저에서 돌아오는 딥링크(ASWebAuthenticationSession 이 못 받은 경우).
                .onOpenURL { url in
                    #if DEBUG
                    if DevRoutes.handle(url, app: app) { return }
                    #endif
                    do {
                        if try app.auth.handleCallback(url) {
                            AppLog.auth.info("deeplink.session.ok")
                            app.resumePending()
                        }
                    } catch {
                        AppLog.auth.error("deeplink.session.failed \(error.localizedDescription, privacy: .public)")
                        app.showToast(error.localizedDescription)
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        app.push.clearBadge()
                        app.generation.resumeIfNeeded()
                        Task { await app.refreshQuota(); await app.push.refreshAuthorization() }
                    }
                }
                // 첫 실행 가이드 1장 — 시트가 아니라 전체 화면, 다른 팝업과 겹치지 않는다.
                .fullScreenCover(isPresented: Binding(get: { app.showGuide }, set: { if !$0 { app.finishGuide() } })) {
                    GuideView { app.finishGuide() }
                }
        }
    }
}

/// APNs 토큰 → Firebase Messaging 브리지(스위즐링 끔). 이 셋이 없으면 iOS 에서 FCM 토큰이 안 나온다.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushManager.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        MainActor.assumeIsolated { PushManager.shared.didFailToRegister(error) }
    }
}
