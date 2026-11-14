import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

@available(iOS 16.2, *)
private struct FACLockScreenActivityView: View {
    let context: ActivityViewContext<FACLiveActivityAttributes>

    private var isFinished: Bool {
        context.state.status == "finished" || context.isStale
    }

    private let charcoal = Color(red: 27 / 255, green: 39 / 255, blue: 43 / 255)
    private let lime = Color(red: 185 / 255, green: 252 / 255, blue: 105 / 255)

    // The existing PNG is copied as a *loose resource* into the WidgetKit
    // extension, not compiled into an asset catalog. Resolve it explicitly from
    // the extension bundle; Image("name") is an asset lookup on some iOS builds.
    private static let bundledAppIcon: UIImage? = {
        guard let url = Bundle.main.url(forResource: "AppIcon-512@2x", withExtension: "png") else {
            return nil
        }
        return UIImage(contentsOfFile: url.path)
    }()

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 9) {
                // Exact existing application icon; copied into this extension's bundle.
                if let appIcon = Self.bundledAppIcon {
                    Image(uiImage: appIcon)
                        .resizable()
                        .frame(width: 32, height: 32)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                } else {
                    // Keep the approved spacing if the bundle is incomplete,
                    // without inserting an unapproved replacement symbol.
                    Color.clear.frame(width: 32, height: 32)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Fancy a Cuppa?")
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .textCase(.uppercase)
                        .foregroundStyle(.white)

                    Text(isFinished ? "Your cuppa is ready" : "Brewing your Tea")
                        .font(.system(size: 10, weight: .regular, design: .monospaced))
                        .foregroundStyle(Color(red: 243 / 255, green: 242 / 255, blue: 240 / 255))
                }
                .lineLimit(1)
            }
            Spacer(minLength: 4)

            Group {
                if isFinished {
                    Text("READY")
                        .font(.system(size: 20, weight: .medium, design: .monospaced))
                } else {
                    Text(timerInterval: context.state.startDate...context.state.endDate,
                         countsDown: true,
                         showsHours: false)
                        .font(.system(size: 26, weight: .medium, design: .monospaced))
                        .monospacedDigit()
                }
            }
            .foregroundStyle(lime)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 8)
        .frame(minHeight: 70)
        .activityBackgroundTint(charcoal.opacity(context.attributes.translucent ? 0.74 : 1))
        .activitySystemActionForegroundColor(lime)
    }
}

// The Dynamic Island closure is required for ActivityConfiguration, but this
// phase does not introduce a Dynamic Island product screen or user controls.
@available(iOS 16.2, *)
struct FACLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FACLiveActivityAttributes.self) { context in
            FACLockScreenActivityView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    Text("Fancy a Cuppa?")
                }
            } compactLeading: {
                Text("FAC")
            } compactTrailing: {
                Text("")
            } minimal: {
                Text("FAC")
            }
        }
    }
}

@main
@available(iOS 16.2, *)
struct FACLiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        FACLiveActivityWidget()
    }
}
