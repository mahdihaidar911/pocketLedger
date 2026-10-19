import { Appearance } from 'react-native';
import type { AppearancePreference } from '../theme/appearance';

export function applyNativeAppearance(preference: AppearancePreference) {
  // Match the installed RN 0.86.3 API. Newer documentation calls this "auto".
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  return Appearance.getColorScheme();
}

export function subscribeNativeAppearance(listener: (scheme: ReturnType<typeof Appearance.getColorScheme>) => void) {
  return Appearance.addChangeListener(() => listener(Appearance.getColorScheme()));
}
