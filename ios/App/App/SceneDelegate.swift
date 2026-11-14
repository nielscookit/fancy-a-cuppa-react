import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Match the white native launch screen before Capacitor's WebView paints.
        window?.backgroundColor = .white
        window?.overrideUserInterfaceStyle = .light
        let bridgeController = FACBridgeViewController()
        bridgeController.view.backgroundColor = .white
        window?.rootViewController = bridgeController
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        setWebMediaSuspended(true)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        setWebMediaSuspended(false)
        if #available(iOS 16.2, *) {
            Task { @MainActor in
                await FACLiveActivityPlugin.finishExpiredActivities()
            }
        }
    }

    private func setWebMediaSuspended(_ suspended: Bool) {
        let controller = window?.rootViewController as? FACBridgeViewController
        controller?.webView?.setAllMediaPlaybackSuspended(suspended, completionHandler: nil)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
