import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { ActivityIndicator, Appearance, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import { getAppearancePreference, setAppearancePreference } from '../repositories/settingsRepository';
import { AppearanceController, type AppearanceState } from '../services/appearanceController';
import { applyNativeAppearance, subscribeNativeAppearance } from '../services/nativeAppearanceService';
import { resolveAppearance, type ResolvedAppearance } from './appearance';
import { darkColors, lightColors, type ThemeColors } from './colors';

interface ThemeContextValue extends AppearanceState {
  colors: ThemeColors;
  scheme: ResolvedAppearance;
  setPreference: AppearanceController['setPreference'];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const controller = useMemo(() => new AppearanceController({
    read: () => getAppearancePreference(db),
    write: (preference) => setAppearancePreference(db, preference),
  }), [db]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [deviceScheme, setDeviceScheme] = useState(() => Appearance.getColorScheme());
  const scheme = resolveAppearance(state.preference, deviceScheme);
  const colors = scheme === 'dark' ? darkColors : lightColors;

  useEffect(() => { void controller.initialize(); }, [controller]);
  useLayoutEffect(() => {
    const subscription = subscribeNativeAppearance(setDeviceScheme);
    // RN 0.86.3 calls the system-following value "unspecified" (not "auto").
    // Clear the override and read again, so Dark -> System uses the current OS
    // preference rather than the previous application override.
    setDeviceScheme(applyNativeAppearance(state.preference));
    return () => subscription.remove();
  }, [state.preference]);
  useEffect(() => () => { applyNativeAppearance('system'); }, []);
  useEffect(() => {
    // Cosmetic native chrome failures do not log an expected error overlay or
    // affect either the saved preference or the separate security boundary.
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const navigationTheme = useMemo(() => ({
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      primary: colors.primary, background: colors.background, card: colors.surface,
      text: colors.text, border: colors.border, notification: colors.danger,
    },
  }), [colors, scheme]);
  const value = useMemo(() => ({ ...state, colors, scheme, setPreference: controller.setPreference }), [state, colors, scheme, controller]);

  return <ThemeContext.Provider value={value}>
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {state.ready ? children : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator accessibilityLabel="Loading appearance" color={colors.primary} size="large" />
        </View>}
      </View>
    </NavigationThemeProvider>
  </ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Theme context is missing.');
  return theme;
}

// One stable stylesheet per palette, shared by all instances of a component.
// Components still subscribe through useTheme, so mounted screens update live.
export function createThemedStyles<T>(factory: (colors: ThemeColors) => T): () => T {
  const cache = new WeakMap<ThemeColors, T>();
  return function useStyles() {
    const { colors } = useTheme();
    if (!cache.has(colors)) cache.set(colors, factory(colors));
    return cache.get(colors)!;
  };
}
