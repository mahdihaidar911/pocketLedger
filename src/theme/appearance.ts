export type AppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedAppearance = 'light' | 'dark';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveAppearance(preference: AppearancePreference, deviceScheme: string | null | undefined): ResolvedAppearance {
  return preference === 'system' ? (deviceScheme === 'dark' ? 'dark' : 'light') : preference;
}

export const appearanceLabels: Record<AppearancePreference, string> = {
  system: 'System', light: 'Light', dark: 'Dark',
};
