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
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)]

    private var completionTask: Task<Void, Never>?

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
        completionTask?.cancel()
        completionTask = nil
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
        let effectiveStatus = status == "running" && deadlineDate <= now ? "finished" : status
        let state = FACLiveActivityAttributes.ContentState(
            startDate: now, endDate: endDate, status: effectiveStatus,
            pauseDate: status == "paused" ? now : nil
        )
        let content = ActivityContent(state: state, staleDate: effectiveStatus == "running" ? endDate : nil)
        if let current {
            await current.update(content)
        } else if status == "running", deadlineDate > now,
                  ActivityAuthorizationInfo().areActivitiesEnabled {
            current = try Activity.request(
                attributes: FACLiveActivityAttributes(sessionID: "fac-timer-" + UUID().uuidString, translucent: true),
                content: content, pushType: nil
            )
        }
        if effectiveStatus == "running", let current {
            completionTask = Task { @MainActor in
                let seconds = max(0, endDate.timeIntervalSinceNow)
                do {
                    try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                } catch { return }
                guard !Task.isCancelled, current.content.state.endDate == endDate else { return }
                await Self.finishIfExpired(current)
            }
        }
    }

    @available(iOS 16.2, *)
    @MainActor
    static func finishExpiredActivities() async {
        for activity in Activity<FACLiveActivityAttributes>.activities {
            await finishIfExpired(activity)
        }
    }

    @available(iOS 16.2, *)
    @MainActor
    private static func finishIfExpired(_ activity: Activity<FACLiveActivityAttributes>) async {
        var state = activity.content.state
        guard activity.attributes.sessionID.hasPrefix("fac-timer-"),
              state.status == "running", state.endDate <= Date() else { return }
        state.status = "finished"
        await activity.update(ActivityContent(state: state, staleDate: nil))
    }
}
