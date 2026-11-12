import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { NATIVE_READY_SOUND_FILE } from './nativeNotificationController.js';

// Validate tracked sources before the macOS runner converts the MP3 to CAF.
test('custom iOS Ready sound has a source and is included in Xcode resources', () => {
  assert.equal(NATIVE_READY_SOUND_FILE, 'Ready.caf');
  assert.equal(existsSync('public/audio/Ready.mp3'), true);
  assert.equal(existsSync('scripts/prepare-ios-ready-sound.sh'), true);
  const xcode = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  assert.match(xcode, /Ready\.caf in Resources/);
  assert.match(xcode, /path = Ready\.caf;/);
  const pipeline = readFileSync('.github/workflows/native-ios-xcode.yml', 'utf8');
  assert.match(pipeline, /bash scripts\/prepare-ios-ready-sound\.sh/);
  assert.match(pipeline, /test -s "\$APP\/Ready\.caf"/);
});
