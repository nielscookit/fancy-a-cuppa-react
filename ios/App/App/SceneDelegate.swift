import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

#if DEBUG
    private var didLaunchFACActivityPrototype = false
#endif

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Match the white native launch screen before Capacitor's WebView paints.
        window?.backgroundColor = .white
        window?.overrideUserInterfaceStyle = .light
        let bridgeController = CAPBridgeViewController()
        bridgeController.view.backgroundColor = .white
        window?.rootViewController = bridgeController
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
#if DEBUG
        if !didLaunchFACActivityPrototype {
            didLaunchFACActivityPrototype = true
            if #available(iOS 16.2, *) {
                Task { @MainActor in
                    FACLiveActivityPrototype.launchIfRequested()
                }
            }
        }
#endif
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
