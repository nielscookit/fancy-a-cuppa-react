import ActivityKit
import Foundation

// DEBUG-only Phase 1 harness. Invoke from the Xcode Run scheme with one of:
// -FACLiveActivityPrototype
// -FACLiveActivityPrototypeTranslucent
// -FACLiveActivityPrototypeFinished
// -FACLiveActivityPrototypeReset
// No changes to the React timer, audio, notifications or navigation.
#if DEBUG
@available(iOS 16.2, *)
enum FACLiveActivityPrototype {
    @MainActor
    static func launchIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        let running = args.contains("-FACLiveActivityPrototype")
        let translucent = args.contains("-FACLiveActivityPrototypeTranslucent")
        let finished = args.contains("-FACLiveActivityPrototypeFinished")
        let reset = args.contains("-FACLiveActivityPrototypeReset")
        guard running || translucent || finished || reset else { return }

        Task { @MainActor in
            // Keep the test isolated and repeatable; only remove old *prototype*
            // activities, never any future production timer activity.
            for activity in Activity<FACLiveActivityAttributes>.activities
                where activity.attributes.sessionID.hasPrefix("fac-phase1-") {
                await activity.end(nil, dismissalPolicy: .immediate)
            }

            guard !reset else {
                NSLog("[FAC Activity prototype] reset completed")
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                NSLog("[FAC Activity prototype] Live Activities disabled in iOS Settings")
                return
            }

            let now = Date()
            let endDate = now.addingTimeInterval(finished ? 1 : 120)
            let attributes = FACLiveActivityAttributes(
                sessionID: "fac-phase1-" + UUID().uuidString,
                translucent: translucent
            )
            let state = FACLiveActivityAttributes.ContentState(
                startDate: now,
                endDate: endDate,
                status: finished ? "finished" : "running"
            )

            do {
                let content = ActivityContent(
                    state: state,
                    staleDate: finished ? nil : endDate
                )
                let activity = try Activity<FACLiveActivityAttributes>.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                NSLog("[FAC Activity prototype] started: %@", activity.id)
            } catch {
                NSLog("[FAC Activity prototype] failed: %@", String(describing: error))
            }
        }
    }
}
#endif
