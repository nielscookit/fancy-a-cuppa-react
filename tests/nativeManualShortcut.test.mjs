import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = readFileSync('ios/App/App/FACTeaCameraPlugin.swift', 'utf8');
function method(name) {
  const start = source.indexOf('private func ' + name + ' {');
  assert.notEqual(start, -1);
  const end = source.indexOf('\n    }', start);
  assert.notEqual(end, -1);
  return source.slice(source.lastIndexOf('\n', start) + 1, end + 6);
}

test('UI-10 Swift handlers: four-second collapse, immediate ADD and lifecycle cancellation', {
  skip: process.platform !== 'darwin' ? 'Requires the Apple Swift toolchain; runs in macOS Xcode CI.' : false,
}, () => {
  // Execute the actual controller methods without creating a camera or changing
  // Xcode targets/signing. Only UIKit drawing/animation scheduling is stubbed.
  const code = `import Foundation
final class Button { var isEnabled = true }
final class View { func layoutIfNeeded() {} ; func setNeedsLayout() {} }
enum UIView {
    enum Option { case beginFromCurrentState, allowUserInteraction }
    static func animate(withDuration: Double, delay: Double, options: [Option], animations: () -> Void) {
        animations()
    }
}
@MainActor final class Camera {
    let manual = Button()
    let view = View()
    var closed = false, cameraActive = true, manualExpanded = false, manualOpening = false
    var manualCollapseTask: Task<Void, Never>?
    var candidateID: String? = "accepted-pending-scan"
    var events: [String] = []
    var navigations = 0
    func onState(_ reason: String) { events.append(reason) }
    func addTea() { navigations += 1; closeCamera() }
    func tap() { openManualShortcut() }
    func closeCamera() { closed = true; cameraActive = false; cancelManualShortcut() }
    func background() { cameraActive = false; cancelManualShortcut() }
${method('setManualShortcutExpanded(_ expanded: Bool)')}
${method('cancelManualCollapse()')}
${method('cancelManualShortcut()')}
${method('openManualShortcut()')}
}
@MainActor func runChecks() async throws {
    let first = Camera()
    first.tap()
    assert(first.manualExpanded && !first.closed && first.navigations == 0)
    assert(first.events.isEmpty && first.candidateID == "accepted-pending-scan")
    try await Task.sleep(nanoseconds: 3_700_000_000)
    assert(first.manualExpanded)
    await first.manualCollapseTask?.value
    assert(!first.manualExpanded && first.navigations == 0 && first.events.isEmpty)

    first.tap()
    assert(first.manualExpanded && first.navigations == 0)
    let timeout = first.manualCollapseTask
    first.tap()
    assert(first.navigations == 1 && first.events == ["mode_changed"])
    assert(timeout?.isCancelled == true && first.manualCollapseTask == nil)
    first.tap()
    await timeout?.value
    assert(first.navigations == 1)

    for close in [true, false] {
        let camera = Camera()
        camera.tap()
        let timeout = camera.manualCollapseTask
        if close { camera.closeCamera() } else { camera.background() }
        assert(timeout?.isCancelled == true && camera.manualCollapseTask == nil)
        await timeout?.value
        assert(camera.navigations == 0 && !camera.manualExpanded)
    }
}
try await runChecks()
print("UI-10 Swift interaction checks passed")
`;
  const directory = mkdtempSync(join(tmpdir(), 'fac-ui10-'));
  try {
    const path = join(directory, 'ManualShortcut.swift');
    writeFileSync(path, code);
    const output = execFileSync('swift', ['-swift-version', '5', path], { encoding:'utf8', timeout:60000 });
    assert.match(output, /UI-10 Swift interaction checks passed/);
  } finally {
    rmSync(directory, { recursive:true, force:true });
  }
});
