import SwiftUI

@main
struct RimikimiApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(app)
                .tint(Color.accent)
                .preferredColorScheme(nil)
                .task {
                    await app.concepts.load()
                    app.generation.resumeIfNeeded()
                    await app.refreshQuota()
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
                        app.generation.resumeIfNeeded()
                        Task { await app.refreshQuota() }
                    }
                }
        }
    }
}
