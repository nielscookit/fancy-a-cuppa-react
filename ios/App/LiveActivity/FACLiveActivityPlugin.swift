import ActivityKit
import Capacitor
import UIKit

final class FACBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(FACLiveActivityPlugin())
    }
}

@objc(FACLiveActivityPlugin)
final class FACLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACLiveActivityPlugin"
    let jsName = "FACLiveActivity"
    let pluginMethods = [CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)]

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        let status = call.getString("status") ?? "idle"
        let deadline = call.getDouble("deadline") ?? 0
        let remaining = call.getDouble("remaining") ?? 0

        Task { @MainActor in
            do {
                try await updateActivity(status: status, deadline: deadline, remaining: remaining)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @available(iOS 16.2, *)
    @MainActor
    private func updateActivity(status: String, deadline: Double, remaining: Double) async throws {
        var current: Activity<FACLiveActivityAttributes>?
        for activity in Activity<FACLiveActivityAttributes>.activities {
            if status != "idle", current == nil, activity.attributes.sessionID.hasPrefix("fac-timer-") {
                current = activity
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        guard status != "idle" else { return }

        let now = Date()
        let deadlineDate = Date(timeIntervalSince1970: deadline / 1000)
        let endDate = status == "running" ? max(now, deadlineDate)
            : now.addingTimeInterval(status == "paused" ? max(0, remaining) : 0)
        let state = FACLiveActivityAttributes.ContentState(
            startDate: now, endDate: endDate, status: status,
            pauseDate: status == "paused" ? now : nil
        )
        let content = ActivityContent(state: state, staleDate: status == "running" ? endDate : nil)
        if let current {
            await current.update(content)
        } else if status == "running", deadlineDate > now,
                  ActivityAuthorizationInfo().areActivitiesEnabled {
            _ = try Activity.request(
                attributes: FACLiveActivityAttributes(sessionID: "fac-timer-" + UUID().uuidString, translucent: true),
                content: content, pushType: nil
            )
        }
    }
}
