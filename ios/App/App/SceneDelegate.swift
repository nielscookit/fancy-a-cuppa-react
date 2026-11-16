import UIKit
import Capacitor
import WebKit
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var mediaSuspension: UUID?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        #if DEBUG && canImport(AlarmKit)
        if #available(iOS 26.0, *), ProcessInfo.processInfo.arguments.contains("-FACAlarmKitPrototype") {
            window?.rootViewController = UIHostingController(rootView: FACAlarmKitPrototypeView())
            window?.makeKeyAndVisible()
            return
        }
        #endif
        deliverQuickAccess(connectionOptions.urlContexts)
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
        guard window?.rootViewController is FACBridgeViewController else { return }
        FACQuickAccessPlugin.signalIfPending()
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
        deliverQuickAccess(URLContexts)
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    private func deliverQuickAccess(_ contexts: Set<UIOpenURLContext>) {
        let targets = Set(contexts.compactMap {
            FACQuickAccessTarget(url: $0.url, hostID: Bundle.main.bundleIdentifier)
        })
        // UIKit provides an unordered set. Prefer the less invasive timer
        // destination if two different quick links arrive in one callback.
        if let target = targets.contains(.timer) ? .timer : targets.first {
            FACQuickAccessPlugin.enqueue(target)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

@objc(FACQuickAccessPlugin)
final class FACQuickAccessPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACQuickAccessPlugin"
    let jsName = "FACQuickAccess"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise)
    ]

    private static let changed = Notification.Name("FACQuickAccessChanged")
    @MainActor private static var pending: FACQuickAccessTarget?
    @MainActor private static var lastDelivery: (FACQuickAccessTarget, TimeInterval)?

    @MainActor static func enqueue(_ target: FACQuickAccessTarget) {
        let now = ProcessInfo.processInfo.systemUptime
        if let (previous, time) = lastDelivery, previous == target, now - time < 1 { return }
        lastDelivery = (target, now)
        pending = target
        signalIfPending()
    }

    @MainActor static func signalIfPending() {
        guard pending != nil else { return }
        NotificationCenter.default.post(name: changed, object: nil)
    }

    override func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(signalPending), name: Self.changed, object: nil
        )
    }

    @objc private func signalPending(_ notification: Notification) {
        notifyListeners("pending", data: [:])
    }

    @objc func takePending(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard self.bridge?.viewController?.viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive else {
                call.resolve()
                return
            }
            let target = Self.pending
            Self.pending = nil
            if let target { call.resolve(["target": target.rawValue]) }
            else { call.resolve() }
        }
    }
}

#if DEBUG && canImport(AlarmKit)
@available(iOS 26.0, *)
private struct FACAlarmKitPrototypeView: View {
    // Stable across relaunches and reserved exclusively for this prototype.
    private let alarmID = UUID(uuid: (0xFA, 0xCA, 0x26, 0x00, 0, 0, 0x40, 0, 0x80, 0, 0, 0, 0, 0, 0, 1))
    private let manager = AlarmManager.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var alarm: Alarm?
    @State private var busy = false
    @State private var message = ""

    var body: some View {
        VStack(spacing: 16) {
            Text("AlarmKit Prototype").font(.title)
            Text("60 seconds")
            Text(alarm.map { String(describing: $0.state) } ?? "Idle")
                .monospaced()
            Button("START") { perform(begin) }
            Button("PAUSE") { perform { try manager.pause(id: alarmID) } }
                .disabled(alarm?.state != .countdown)
            Button("RESUME") { perform { try manager.resume(id: alarmID) } }
                .disabled(alarm?.state != .paused)
            Button("STOP / CANCEL") { perform(clearAlarm) }
                .disabled(alarm == nil)
            Text(message)
        }
        .padding()
        .disabled(busy)
        .task {
            refresh()
            for await alarms in manager.alarmUpdates {
                alarm = alarms.first { $0.id == alarmID }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { refresh() }
        }
    }

    private func refresh() {
        do {
            alarm = try manager.alarms.first { $0.id == alarmID }
        } catch {
            message = error.localizedDescription
        }
    }

    private func perform(_ action: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        busy = true
        message = ""
        Task { @MainActor in
            defer { busy = false; refresh() }
            do { try await action() }
            catch { message = error.localizedDescription }
        }
    }

    private func clearAlarm() throws {
        guard let existing = try manager.alarms.first(where: { $0.id == alarmID }) else { return }
        if existing.state == .alerting {
            try manager.stop(id: alarmID)
        } else {
            try manager.cancel(id: alarmID)
        }
    }

    private func begin() async throws {
        guard try await manager.requestAuthorization() == .authorized else {
            message = "Alarm permission was not granted."
            return
        }
        guard Bundle.main.url(forResource: "Ready", withExtension: "caf") != nil else {
            message = "Ready.caf is missing from the app bundle."
            return
        }
        try clearAlarm()
        let attributes = facTeaAlarmAttributes(prototype: true)
        alarm = try await manager.schedule(id: alarmID, configuration: .timer(
            duration: 60, attributes: attributes, sound: .named("Ready.caf")
        ))
    }
}
#endif

#if canImport(AlarmKit)
@available(iOS 26.0, *)
func facTeaAlarmAttributes(prototype: Bool = false) -> AlarmAttributes<FACAlarmPrototypeMetadata> {
    let accent = Color(red: 185 / 255, green: 252 / 255, blue: 105 / 255)
    return AlarmAttributes(
        presentation: AlarmPresentation(
            alert: .init(title: "Your cuppa is ready", stopButton: AlarmButton(
                text: "Stop", textColor: .white, systemImageName: "stop.circle"
            )),
            countdown: .init(title: "Brewing your Tea", pauseButton: nil),
            paused: prototype ? .init(title: "Paused", resumeButton: AlarmButton(
                text: "Resume", textColor: accent, systemImageName: "play.circle"
            )) : nil
        ),
        metadata: FACAlarmPrototypeMetadata(),
        tintColor: accent
    )
}
#endif
