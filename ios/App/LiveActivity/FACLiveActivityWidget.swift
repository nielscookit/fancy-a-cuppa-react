import ActivityKit
import SwiftUI
import UIKit
import CoreText
import ImageIO
import WidgetKit
#if canImport(AlarmKit)
import AlarmKit
#endif

@available(iOS 16.2, *)
private struct FACLockScreenActivityView: View {
    let isFinished: Bool
    let interval: ClosedRange<Date>
    let pauseDate: Date?

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
                    Text(timerInterval: interval,
                         pauseTime: pauseDate,
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
        // Fill the available Live Activity width; otherwise WidgetKit may
        // size the HStack to its contents, leaving the countdown beside the title.
        .frame(maxWidth: .infinity, alignment: .leading)
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
            FACLockScreenActivityView(
                isFinished: context.state.status == "finished"
                    || (context.state.status == "running" && (context.isStale || context.state.endDate <= Date())),
                interval: context.state.startDate...max(context.state.startDate, context.state.endDate),
                pauseDate: context.state.pauseDate
            )
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
        FACQuickAccessWidget(target: .timer)
        FACQuickAccessWidget(target: .scanner)
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            FACAlarmPrototypeWidget()
        }
        #endif
    }
}

private struct FACQuickAccessEntry: TimelineEntry {
    let date = Date()
}

private struct FACQuickAccessProvider: TimelineProvider {
    func placeholder(in context: Context) -> FACQuickAccessEntry { FACQuickAccessEntry() }

    func getSnapshot(in context: Context, completion: @escaping (FACQuickAccessEntry) -> Void) {
        completion(FACQuickAccessEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FACQuickAccessEntry>) -> Void) {
        completion(Timeline(entries: [FACQuickAccessEntry()], policy: .never))
    }
}

private struct FACQuickAccessWidget: Widget {
    let target: FACQuickAccessTarget

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FACQuickAccess." + target.rawValue, provider: FACQuickAccessProvider()) { _ in
            FACQuickAccessView(target: target)
        }
        .supportedFamilies([.accessoryCircular])
        .configurationDisplayName(target == .timer ? "Tea Timer" : "Tea Scanner")
        .description(target == .timer ? "Open the timer." : "Open the tea camera.")

        .contentMarginsDisabled()
    }
}

private struct FACQuickAccessView: View {
    let target: FACQuickAccessTarget

    private var face: some View {
        GeometryReader { geometry in
            let diameter = min(geometry.size.width, geometry.size.height)
            let unit = diameter / 72
            ZStack {
                Circle()
                    .fill(Color(red: 50 / 255, green: 54 / 255, blue: 58 / 255))
                Circle()
                    .strokeBorder(Color(red: 108 / 255, green: 115 / 255, blue: 119 / 255),
                                  lineWidth: unit)
                if let url = Bundle.main.url(forResource: "uc01-" + target.rawValue, withExtension: "png"),
                   let icon = UIImage(contentsOfFile: url.path) {
                    Image(uiImage: icon)
                        .renderingMode(.template)
                        .resizable()
                        .foregroundStyle(.white)
                        .frame(width: 32 * unit, height: (target == .timer ? 22 : 32) * unit)
                        .offset(x: -unit, y: -unit)
                        .widgetAccentable()
                }
            }
            .frame(width: diameter, height: diameter)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityLabel(target == .timer ? "Tea Timer" : "Tea Scanner")
        .widgetURL(FACQuickAccessTarget.widgetURL(for: target, extensionID: Bundle.main.bundleIdentifier))
    }

    var body: some View {
        if #available(iOS 17.0, *) {
            face.containerBackground(.clear, for: .widget)
        } else {
            face
        }
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
private struct FACAlarmPrototypeWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<FACAlarmPrototypeMetadata>.self) { context in
            switch context.state.mode {
            case .countdown(let countdown):
                FACLockScreenActivityView(
                    isFinished: false, interval: min(countdown.startDate, countdown.fireDate)...countdown.fireDate, pauseDate: nil
                )
            case .paused(let paused):
                let start = Date(timeIntervalSinceReferenceDate: 0)
                let end = start.addingTimeInterval(paused.totalCountdownDuration)
                FACLockScreenActivityView(
                    isFinished: false, interval: start...end,
                    pauseDate: min(end, start.addingTimeInterval(paused.previouslyElapsedDuration))
                )
            case .alert:
                // AlarmKit owns the system stop action. Keep the widget content
                // visible if iOS presents the Live Activity while it rings.
                let instant = Date(timeIntervalSinceReferenceDate: 0)
                FACLockScreenActivityView(
                    isFinished: true, interval: instant...instant, pauseDate: nil
                )
            @unknown default:
                EmptyView()
            }
        } dynamicIsland: { _ in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) { Text("Fancy a Cuppa?") }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                EmptyView()
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}
#endif
