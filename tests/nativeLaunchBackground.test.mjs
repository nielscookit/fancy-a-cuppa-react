import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('native launch surface stays white while Capacitor starts', () => {
  const launch = readFileSync('ios/App/App/Base.lproj/LaunchScreen.storyboard', 'utf8');
  const scene = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');

  assert.match(launch, /<view key="view" contentMode="scaleToFill"/);
  assert.match(launch, /<color key="backgroundColor" red="1" green="1" blue="1" alpha="1"/);
  assert.doesNotMatch(launch, /image="Splash"|systemBackgroundColor/);
  assert.match(scene, /window\?\.backgroundColor = \.white/);
  assert.match(scene, /window\?\.overrideUserInterfaceStyle = \.light/);
  assert.match(scene, /bridgeController\.view\.backgroundColor = \.white/);
});
