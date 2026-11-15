import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native Live Activity Phase 1 is a separate embedded widget extension', () => {
  const project=readFileSync('ios/App/App.xcodeproj/project.pbxproj','utf8');
  const info=readFileSync('ios/App/App/Info.plist','utf8');
  const delegate=readFileSync('ios/App/App/SceneDelegate.swift','utf8');
  const widget=readFileSync('ios/App/LiveActivity/FACLiveActivityWidget.swift','utf8');
  const model=readFileSync('ios/App/LiveActivity/FACActivityAttributes.swift','utf8');
  const ext=readFileSync('ios/App/LiveActivity/Info.plist','utf8');
  assert.match(project,/FACLiveActivityExtension\.appex in Embed App Extensions/);
  assert.match(project,/dstSubfolderSpec = 13/);
  assert.match(project,/com\.fancyacuppa\.app\.liveactivity/);
  assert.match(info,/<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
  assert.match(ext,/com\.apple\.widgetkit-extension/);
  assert.match(delegate,/let bridgeController = FACBridgeViewController\(\)/);
  assert.doesNotMatch(delegate,/FACLiveActivityPrototype/);
  assert.match(model,/struct FACLiveActivityAttributes: ActivityAttributes/);
  assert.match(widget,/ActivityConfiguration\(for: FACLiveActivityAttributes\.self\)/);
  assert.match(widget,/"Your cuppa is ready" : "Brewing your Tea"/);
  assert.match(widget,/Text\("READY"\)/);
  assert.match(widget,/Bundle\.main\.url\(forResource: "AppIcon-512@2x", withExtension: "png"\)/);
  assert.match(widget,/CGImageSourceCreateThumbnailAtIndex\(source, 0, options as CFDictionary\)/);
  assert.match(widget,/kCGImageSourceThumbnailMaxPixelSize: 96/);
  assert.match(widget,/Image\(decorative: appIcon, scale: 3\)/);
  assert.match(widget, /activityBackgroundTint\(charcoal\.opacity\(0\.8\)\)/);
  assert.match(widget, /\.frame\(maxWidth: \.infinity, alignment: \.leading\)/);
  assert.match(widget, /activitySystemActionForegroundColor\(charcoal\)/);
  assert.match(widget, /CTFontManagerRegisterFontsForURL/);
  for (const weight of ['Regular', 'Medium']) {
    const font = 'RobotoMono-' + weight + '.ttf';
    assert.ok(project.includes(font + ' in Activity Resources'));
    assert.ok(readFileSync('ios/App/LiveActivity/Fonts/' + font).length > 0);
  }
  assert.doesNotMatch(widget,/Image\(uiImage: appIcon\)/);
  assert.doesNotMatch(widget,/Image\("AppIcon-512@2x"\)/);
});

test('native prototype does not modify existing timer or native notification code', () => {
  const harness=readFileSync('ios/App/LiveActivity/FACLiveActivityPrototype.swift','utf8');
  assert.match(harness,/#if DEBUG/);
  assert.match(harness,/-FACLiveActivityPrototype/);
  assert.match(harness,/Activity<FACLiveActivityAttributes>\.request/);
  assert.doesNotMatch(harness,/LocalNotifications|useTeaTimer|nativeNotificationController/);
});

test('native deadline reconciliation and media suspension follow the scene lifecycle', () => {
  const scene = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');
  const plugin = readFileSync('ios/App/LiveActivity/FACLiveActivityPlugin.swift', 'utf8');
  assert.match(scene, /sceneDidEnterBackground[^}]+setAllMediaPlaybackSuspended\(true/);
  assert.match(scene, /sceneDidBecomeActive[\s\S]+?resumeWebMedia\(in: scene\)[^}]+finishExpiredActivities\(\)/);
  assert.match(scene, /evaluateJavaScript[^\n]+fac:native-foreground[\s\S]+mediaSuspension == suspension[\s\S]+setAllMediaPlaybackSuspended\(false/);
  assert.match(plugin, /completionTask\?\.cancel\(\)/);
  assert.match(plugin, /current\.content\.state\.endDate == endDate/);
  assert.match(plugin, /state\.status == "running", state\.endDate <= Date\(\)/);
});

test('AlarmKit prototype is explicitly enabled in Debug and owns one isolated alarm', () => {
  const scene = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');
  const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
  const widget = readFileSync('ios/App/LiveActivity/FACLiveActivityWidget.swift', 'utf8');
  const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  assert.match(scene, /#if DEBUG && canImport\(AlarmKit\)\s+if #available\(iOS 26\.0, \*\), ProcessInfo\.processInfo\.arguments\.contains\("-FACAlarmKitPrototype"\)/);
  assert.match(scene, /UIHostingController\(rootView: FACAlarmKitPrototypeView\(\)\)[\s\S]+?return\s+}\s+#endif[\s\S]+?FACBridgeViewController\(\)/);
  assert.match(scene, /private let alarmID = UUID\(uuid:/);
  assert.match(scene, /try clearAlarm\(\)[\s\S]+?manager\.schedule\(id: alarmID, configuration: \.timer\(\s+duration: 60, attributes: attributes, sound: \.named\("Ready\.caf"\)/);
  for (const operation of ['pause', 'resume', 'stop', 'cancel']) {
    assert.ok(scene.includes('manager.' + operation + '(id: alarmID)'));
  }
  assert.match(plist, /<key>NSAlarmKitUsageDescription<\/key>\s*<string>[^<]+/);
  assert.match(project, /Ready\.caf in Resources/);
  assert.match(widget, /ActivityConfiguration\(for: AlarmAttributes<FACAlarmPrototypeMetadata>\.self\)/);
  assert.doesNotMatch(scene, /LocalNotifications|secondaryButton|postAlert/);
});

test('AlarmKit alert mode renders the shared READY view and keeps the system stop action', () => {
  const widget = readFileSync('ios/App/LiveActivity/FACLiveActivityWidget.swift', 'utf8');
  const scene = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');
  const alarmWidget = widget.split('private struct FACAlarmPrototypeWidget: Widget')[1];
  assert.match(alarmWidget, /case \.countdown[\s\S]*case \.paused[\s\S]*case \.alert:/);
  const alert = alarmWidget.split('case .alert:')[1].split('@unknown default:')[0];
  assert.match(alert, /FACLockScreenActivityView\(\s*isFinished: true/);
  assert.doesNotMatch(alert, /EmptyView|Button\(/);
  assert.match(scene, /title: "Your cuppa is ready", stopButton: AlarmButton/);
});
