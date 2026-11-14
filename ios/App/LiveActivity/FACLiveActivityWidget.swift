import ActivityKit
import SwiftUI
import CoreText
import ImageIO
import WidgetKit

@available(iOS 16.2, *)
private struct FACLockScreenActivityView: View {
    let context: ActivityViewContext<FACLiveActivityAttributes>

    private var isFinished: Bool {
        context.state.status == "finished" || context.isStale
    }

    private let charcoal = Color(red: 27 / 255, green: 39 / 255, blue: 43 / 255)
    private let lime = Color(red: 185 / 255, green: 252 / 255, blue: 105 / 255)

    // ActivityKit may replace oversized images with a gray placeholder.
    // The original AppIcon is 1024px; decode at most a 96px thumbnail for
    // the 32pt Lock Screen icon slot. Never pass the full-size UIImage.
    private static let bundledAppIcon: CGImage? = {
        guard let url = Bundle.main.url(forResource: "AppIcon-512@2x", withExtension: "png"),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 96
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }()

    private static let registeredFonts: Set<String> = {
        Set(["RobotoMono-Regular", "RobotoMono-Medium"].filter { name in
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else {
                return false
            }
            return CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        })
    }()

    private func monoFont(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        let name = weight == .regular ? "RobotoMono-Regular" : "RobotoMono-Medium"
        if Self.registeredFonts.contains(name) {
            return .custom(name, fixedSize: size)
        }
        return .system(size: size, weight: weight, design: .monospaced)
    }

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 9) {
                // Exact existing application icon; copied into this extension's bundle.
                if let appIcon = Self.bundledAppIcon {
                    Image(decorative: appIcon, scale: 3)
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
                        .font(monoFont(12))
                        .textCase(.uppercase)
                        .foregroundStyle(.white)

                    Text(isFinished ? "Your cuppa is ready" : "Brewing your Tea")
                        .font(monoFont(10, weight: .regular))
                        .foregroundStyle(Color(red: 243 / 255, green: 242 / 255, blue: 240 / 255))
                }
                .lineLimit(1)
            }
            Spacer(minLength: 4)

            Group {
                if isFinished {
                    Text("READY")
                        .font(monoFont(19))
                } else {
                    Text(timerInterval: context.state.startDate...context.state.endDate,
                         countsDown: true,
                         showsHours: false)
                        .font(monoFont(26))
                        .monospacedDigit()
                }
            }
            .foregroundStyle(lime)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .multilineTextAlignment(.trailing)
            .frame(width: 94, alignment: .trailing)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 8)
        .frame(height: 70)
        .activityBackgroundTint(charcoal.opacity(0.8))
        .activitySystemActionForegroundColor(charcoal)
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
