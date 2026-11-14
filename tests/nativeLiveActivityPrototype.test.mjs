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
