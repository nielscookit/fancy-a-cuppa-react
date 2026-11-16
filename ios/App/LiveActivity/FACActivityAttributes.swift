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


// Widget deep links use <app bundle ID>.quick-access://timer or ://scanner.
// The widget extension's bundle ID is the host ID plus ".liveactivity".
enum FACQuickAccessTarget: String {
    case timer, scanner

    static func scheme(for hostID: String) -> String { hostID + ".quick-access" }

    static func widgetURL(for target: Self, extensionID: String?) -> URL? {
        let suffix = ".liveactivity"
        guard let extensionID, extensionID.hasSuffix(suffix) else { return nil }
        let hostID = String(extensionID.dropLast(suffix.count))
        return URL(string: "\(scheme(for: hostID))://\(target.rawValue)")
    }

    init?(url: URL, hostID: String?) {
        guard let hostID, let host = url.host,
              let target = Self(rawValue: host),
              url.absoluteString == "\(Self.scheme(for: hostID))://\(target.rawValue)"
        else { return nil }
        self = target
    }
}
