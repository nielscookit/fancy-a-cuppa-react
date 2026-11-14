// iOS WKWebView can change visualViewport.offsetTop during keyboard focus.
// Anchor the native editor sheet at its approved fixed top gap instead of
// allowing the visual viewport's upward pan to move the entire drawer.
export function nativeEditorSheetGeometry({ layoutHeight, visualHeight, offsetTop }) {
  const layout = Number.isFinite(layoutHeight) && layoutHeight > 0 ? layoutHeight : 0;
  const visual = Number.isFinite(visualHeight) && visualHeight > 0 ? visualHeight : layout;
  const offset = Number.isFinite(offsetTop) ? Math.max(0, offsetTop) : 0;
  const visibleBottom = Math.min(layout, Math.max(0, visual + offset));
  return {
    height: visibleBottom,
    bottom: Math.max(0, layout - visibleBottom),
  };
}

// Scroll only the inner form container; do not scroll the page or drawer.
export function focusedEditorScrollDelta(fieldRect, scrollerRect, margin = 16) {
  const top = scrollerRect.top + margin;
  const bottom = scrollerRect.bottom - margin;
  if (bottom <= top) return 0;
  if (fieldRect.bottom - fieldRect.top > bottom - top) return fieldRect.top - top;
  if (fieldRect.top < top) return fieldRect.top - top;
  if (fieldRect.bottom > bottom) return fieldRect.bottom - bottom;
  return 0;
}
