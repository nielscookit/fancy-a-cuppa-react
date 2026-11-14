import ActivityKit
import Foundation

// Phase 1: isolated, native-only timer proof. No React timer data is read here.
@available(iOS 16.2, *)
struct FACLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startDate: Date
        var endDate: Date
        var status: String
    }

    var sessionID: String
    var translucent: Bool
}
