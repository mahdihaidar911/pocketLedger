// Layout responds to the usable text width, not a particular phone model.
export function getPhoneLayout(width: number, fontScale: number, bottomInset = 0) {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const compact = width / scale < 380;
  const showTabLabels = width / scale >= 360;
  const tabBottomPadding = Math.max(8, bottomInset);
  return {
    compact,
    summaryMinWidth: 150 * scale,
    showTabLabels,
    tabBottomPadding,
    tabBarHeight: tabBottomPadding + (showTabLabels ? 48 + 12 * scale : 56),
  };
}
