import UIKit
import Capacitor

// ============================================================
// UIScene 생명주기 (2026-09-16)
//
// 왜 생겼나: 9/15 Xcode 가 27 로 올라가면서 iOS 27 SDK 로 빌드된 앱은 UIScene 이 없으면
// 실행 자체가 거부된다 — "Application failed to launch: UIScene life cycle is required for
// apps built with this SDK." TestFlight build 85·86·87 이 전부 이 이유로 죽었다(84 는 Xcode 26).
// iOS 26.5 시뮬레이터는 이 검사를 하지 않아서 재현이 안 됐다.
//
// 구조: 창/스토리보드는 Info.plist 의 UIApplicationSceneManifest(UISceneStoryboardFile=Main)가
// 만들고, URL·유니버설 링크는 Capacitor 의 SceneDelegateProxy 로 넘긴다(딥링크
// com.rimikimi.app://login-callback 과 App 플러그인 appUrlOpen 이 그대로 동작한다).
// Scene 이 켜지면 UIApplicationDelegate 의 applicationDidBecomeActive / open(url:) 은
// 더 이상 불리지 않는다 → ATT 팝업·배지 초기화는 여기(sceneDidBecomeActive)에서 부른다.
// ============================================================
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (UIApplication.shared.delegate as? AppDelegate)?.handleDidBecomeActive()
    }
}
