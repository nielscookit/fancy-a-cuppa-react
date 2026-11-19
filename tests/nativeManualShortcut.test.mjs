import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = readFileSync('ios/App/App/FACTeaCameraPlugin.swift', 'utf8');
function method(name) {
  const start = source.indexOf('    @objc private func ' + name + '() {');
  assert.notEqual(start, -1);
  const end = source.indexOf('\n    }', start);
  assert.notEqual(end, -1);
  return source.slice(start, end + 6);
}

test('UI-09 actual Swift handlers: two taps, persistent expansion, close/background and duplicate protection', {
  skip: process.platform !== 'darwin' ? 'Requires the Apple Swift toolchain; runs in macOS Xcode CI.' : false,
}, () => {
  // Execute the actual controller methods without creating a camera or changing
  // Xcode targets/signing. Only UIKit drawing/animation scheduling is stubbed.
  const code = `import Foundation
final class Button { var isEnabled = true }
final class View { func layoutIfNeeded() {} ; func setNeedsLayout() {} }
enum UIView {
    enum Option { case beginFromCurrentState, allowUserInteraction }
    static var pending: [(Bool) -> Void] = []
    static func animate(withDuration: Double, delay: Double, options: [Option],
                        animations: () -> Void, completion: ((Bool) -> Void)? = nil) {
        animations()
        if let completion { pending.append(completion) }
    }
    static func flush() {
        let callbacks = pending
        pending.removeAll()
        for callback in callbacks { callback(true) }
    }
}
final class Camera: NSObject {
    let manual = Button()
    let view = View()
    var closed = false, cameraActive = true, manualExpanded = false, manualOpening = false
    var manualNavigationGeneration = 0
    var candidateID: String? = "accepted-pending-scan"
    var events: [String] = []
    var navigations = 0
    func onState(_ reason: String) { events.append(reason) }
    func render() { manual.isEnabled = !closed && !manualOpening }
    func addTea() { navigations += 1; closeCamera() }
    func tap() { openManualShortcut() }
    func closeCamera() { closed = true; cameraActive = false; cancelManualShortcut() }
    func background() { cameraActive = false; cancelManualShortcut() }
${method('expandManualShortcut')}
${method('cancelManualShortcut')}
${method('openManualShortcut')}
}
let first = Camera()
first.tap()
assert(first.manualExpanded && !first.manualOpening && !first.closed)
assert(first.navigations == 0 && UIView.pending.isEmpty)
assert(first.events.isEmpty && first.candidateID == "accepted-pending-scan")
UIView.flush()
assert(first.manualExpanded && first.navigations == 0)
first.tap()
assert(first.manualOpening && first.events == ["mode_changed"])
assert(UIView.pending.count == 1)
first.tap() // rapid additional tap cannot enqueue a second navigation
assert(UIView.pending.count == 1)
UIView.flush()
assert(first.navigations == 1)
first.tap()
UIView.flush()
assert(first.navigations == 1)
for taps in [1, 2] {
    let closed = Camera()
    for _ in 0..<taps { closed.tap() }
    closed.closeCamera()
    UIView.flush()
    assert(closed.navigations == 0 && !closed.manualExpanded)
    let background = Camera()
    for _ in 0..<taps { background.tap() }
    background.background()
    UIView.flush()
    assert(background.navigations == 0 && !background.manualExpanded)
}
let disabled = Camera()
disabled.manual.isEnabled = false
disabled.tap()
assert(!disabled.manualExpanded && disabled.navigations == 0)
print("UI-09 Swift interaction checks passed")
`;
  const directory = mkdtempSync(join(tmpdir(), 'fac-ui09-'));
  try {
    const path = join(directory, 'ManualShortcut.swift');
    writeFileSync(path, code);
    const output = execFileSync('swift', ['-swift-version', '5', path], { encoding:'utf8', timeout:60000 });
    assert.match(output, /UI-09 Swift interaction checks passed/);
  } finally {
    rmSync(directory, { recursive:true, force:true });
  }
});
