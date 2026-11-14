import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var mediaSuspension: UUID?

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
        mediaSuspension = UUID()
        webView?.setAllMediaPlaybackSuspended(true, completionHandler: nil)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        resumeWebMedia(in: scene)
        if #available(iOS 16.2, *) {
            Task { @MainActor in
                await FACLiveActivityPlugin.finishExpiredActivities()
            }
        }
    }

    private var webView: WKWebView? {
        (window?.rootViewController as? FACBridgeViewController)?.webView
    }

    private func resumeWebMedia(in scene: UIScene) {
        guard let suspension = mediaSuspension, let webView else { return }
        // Reconcile the existing page before WebKit can resume a stale clip.
        webView.evaluateJavaScript("document.dispatchEvent(new Event('fac:native-foreground'))") { [weak self, weak scene] _, error in
            guard let self, self.mediaSuspension == suspension,
                  scene?.activationState == .foregroundActive else { return }
            if let error {
                NSLog("[FAC media] Foreground reconciliation failed: %@", error.localizedDescription)
            }
            self.mediaSuspension = nil
            webView.setAllMediaPlaybackSuspended(false, completionHandler: nil)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
