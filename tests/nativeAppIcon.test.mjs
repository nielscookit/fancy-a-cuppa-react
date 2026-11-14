import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('native iOS app icon is configured and 1024px image exists', () => {
  const contents=JSON.parse(readFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json','utf8'));
  assert.equal(contents.images.length,1);
  const entry=contents.images[0];
  assert.equal(entry.platform,'ios');
  assert.equal(entry.idiom,'universal');
  assert.equal(entry.size,'1024x1024');
  assert.equal(entry.filename,'AppIcon-512@2x.png');
  const png=readFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/'+entry.filename);
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),1024);
  assert.equal(png.readUInt32BE(20),1024);
  const project=readFileSync('ios/App/App.xcodeproj/project.pbxproj','utf8');
  assert.equal((project.match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g)||[]).length,2);
  assert.equal((project.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.fancyacuppa\.app;/g)||[]).length,2);
  const controller=readFileSync('src/push/nativeNotificationController.js','utf8');
  assert.match(controller,/notifications\.schedule\(/);
  assert.doesNotMatch(controller,/smallIcon:|largeIcon:/);
});
