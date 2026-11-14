import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct FACLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startDate: Date
        var endDate: Date
        var status: String
        var pauseDate: Date? = nil
    }

    var sessionID: String
    var translucent: Bool
}

#if canImport(AlarmKit)
import AlarmKit

@available(iOS 26.0, *)
struct FACAlarmPrototypeMetadata: AlarmMetadata {}
#endif
