import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeEditorSheetGeometry, focusedEditorScrollDelta } from '../src/features/nativeEditorKeyboard.js';

test('native editor remains 52px from the layout top when the keyboard opens', () => {
  for (const [visualHeight, offsetTop] of [[812,0],[505,0],[505,120],[520,210],[812,90]]) {
    const layoutHeight = 812;
    const {height, bottom} = nativeEditorSheetGeometry({layoutHeight,visualHeight,offsetTop});
    assert.equal(layoutHeight - bottom - (height - 52), 52);
    assert.ok(height <= layoutHeight);
    assert.ok(bottom >= 0);
  }
});

test('native editor keyboard uses the viewport bottom, not viewport top', () => {
  assert.deepEqual(nativeEditorSheetGeometry({layoutHeight:812,visualHeight:505,offsetTop:120}), {
    height:625, bottom:187,
  });
  assert.deepEqual(nativeEditorSheetGeometry({layoutHeight:812,visualHeight:812,offsetTop:180}), {
    height:812, bottom:0,
  });
  assert.deepEqual(nativeEditorSheetGeometry({layoutHeight:500,visualHeight:500,offsetTop:0}), {
    height:500, bottom:0,
  });
});

test('only internal form scrolls to show covered inputs with 16px breathing room', () => {
  const scroller={top:160,bottom:510};
  assert.equal(focusedEditorScrollDelta({top:470,bottom:518},scroller),24);
  assert.equal(focusedEditorScrollDelta({top:166,bottom:214},scroller),-10);
  assert.equal(focusedEditorScrollDelta({top:250,bottom:298},scroller),0);
  assert.equal(focusedEditorScrollDelta({top:125,bottom:500},scroller),-51);
});

test('iOS native editor is scoped; other sheets and Web/PWA keep original viewport handling', () => {
  const app=readFileSync('src/App.jsx','utf8');
  const css=readFileSync('src/components/tea-sheet.css','utf8');
  assert.match(app,/const nativeEditor = nativeIOS && \(mode === 'add' \|\| mode === 'edit'\)/);
  assert.match(app,/nativeEditor\s*\? nativeEditorSheetGeometry/);
  assert.match(app,/\{ height: visualHeight,\s*bottom: Math\.max\(0, window\.innerHeight - visualHeight - offsetTop\) \}/);
  assert.match(app,/scroller\.scrollTop \+= delta/);
  assert.match(app,/if \(revealFrame\) cancelAnimationFrame\(revealFrame\)/);
  assert.match(css,/\[data-native-editor="true"\] \.fac-sheet-scroll--editor/);
  assert.match(css,/\.fac-sheet-paper\[data-native-expanded-gap="true"\] \{ --sheet-top-gap:52px; \}/);
  assert.match(css,/\.fac-sheet-paper\[data-native-expanded-gap="true"\] \.fac-sheet-footer \{\s*padding-bottom:14px;/);
});
