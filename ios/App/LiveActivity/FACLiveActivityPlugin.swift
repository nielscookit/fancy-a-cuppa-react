import ActivityKit
import Capacitor
import UIKit
#if canImport(AlarmKit)
import AlarmKit
import UserNotifications
#endif

final class FACBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(FACLiveActivityPlugin())
        bridge?.registerPluginInstance(FACTeaAlarmPlugin())
        bridge?.registerPluginInstance(FACTeaCameraPlugin())
        bridge?.registerPluginInstance(FACQuickAccessPlugin())
        bridge?.registerPluginInstance(FACVoiceTeaPlugin())
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

@objc(FACTeaAlarmPlugin)
final class FACTeaAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACTeaAlarmPlugin"
    let jsName = "FACTeaAlarm"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    #if canImport(AlarmKit)
    private let alarmID = UUID(uuid: (0xFA, 0xCA, 0x26, 0x00, 0, 0, 0x40, 0, 0x80, 0, 0, 0, 0, 0, 0, 2))
    private let deadlineKey = "fac.teaAlarm.scheduledDeadline"

    @available(iOS 26.0, *)
    @MainActor
    private func clearAlarm() throws {
        let manager = AlarmManager.shared
        guard manager.authorizationState == .authorized,
              let alarm = try manager.alarms.first(where: { $0.id == alarmID }) else { return }
        if alarm.state == .alerting {
            try manager.stop(id: alarmID)
        } else {
            try manager.cancel(id: alarmID)
        }
    }
    #endif

    @objc func status(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                let manager = AlarmManager.shared
                do {
                    let authorized = manager.authorizationState == .authorized
                    let alarm = authorized ? try manager.alarms.first { $0.id == alarmID } : nil
                    call.resolve([
                        "available": true,
                        "authorized": authorized,
                        "state": alarm.map { String(describing: $0.state) } ?? "idle",
                        "deadline": UserDefaults.standard.double(forKey: deadlineKey)
                    ])
                } catch {
                    call.reject(error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.resolve(["available": false])
    }

    @objc func schedule(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let deadline = call.getDouble("deadline") ?? 0
            Task { @MainActor in
                do {
                    let end = Date(timeIntervalSince1970: deadline / 1000)
                    guard deadline.isFinite, end > Date() else {
                        call.reject("Tea timer deadline has passed.")
                        return
                    }
                    // A recovered countdown must not recreate an alarm already stopped by iOS.
                    if UserDefaults.standard.double(forKey: deadlineKey) == deadline {
                        call.resolve()
                        return
                    }
                    let manager = AlarmManager.shared
                    let authorization = manager.authorizationState == .notDetermined
                        ? try await manager.requestAuthorization() : manager.authorizationState
                    guard authorization == .authorized else {
                        call.reject("AlarmKit permission was not granted.")
                        return
                    }
                    guard Bundle.main.url(forResource: "Ready", withExtension: "caf") != nil else {
                        call.reject("Ready.caf is missing from the app bundle.")
                        return
                    }
                    try clearAlarm()
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["731001"])
                    for activity in Activity<FACLiveActivityAttributes>.activities
                    where activity.attributes.sessionID.hasPrefix("fac-timer-") {
                        await activity.end(nil, dismissalPolicy: .immediate)
                    }
                    let remaining = end.timeIntervalSinceNow
                    guard remaining > 0 else {
                        call.reject("Tea timer deadline has passed.")
                        return
                    }
                    _ = try await manager.schedule(id: alarmID, configuration: .timer(
                        duration: remaining, attributes: facTeaAlarmAttributes(), sound: .named("Ready.caf")
                    ))
                    UserDefaults.standard.set(deadline, forKey: deadlineKey)
                    call.resolve()
                } catch {
                    call.reject(error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.reject("AlarmKit is unavailable on this iOS version.")
    }

    @objc func clear(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                do {
                    try clearAlarm()
                    call.resolve()
                } catch {
                    call.reject(error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.resolve()
    }
}
