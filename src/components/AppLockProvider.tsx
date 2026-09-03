import { createContext, type PropsWithChildren, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from './Screen';
import { usePhoneLayout } from '../hooks/usePhoneLayout';
import { AppLockController, type AppLockState } from '../services/appLockController';
import { appLockAdapter } from '../services/appLockService';
import { createThemedStyles, useTheme, spacing } from '../theme';

const AppLockContext = createContext<{ controller: AppLockController; state: AppLockState } | null>(null);

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) throw new Error('App lock context is missing.');
  return context;
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { compact } = usePhoneLayout();
  const [controller] = useState(() => new AppLockController(appLockAdapter, AppState.currentState ?? 'unknown'));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.setAppState(AppState.currentState ?? 'unknown');
    const subscription = AppState.addEventListener('change', (next) => controller.setAppState(next));
    // On Android the notification drawer can blur the app without changing AppState.
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => controller.setAppState('inactive')) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => controller.setAppState(AppState.currentState)) : null;
    void controller.initialize();
    return () => { subscription.remove(); blur?.remove(); focus?.remove(); };
  }, [controller]);

  return <AppLockContext.Provider value={{ controller, state }}>
    {state.canAccess ? children : <Screen scroll contentStyle={styles.screen}>
      <View style={styles.lockContent} accessibilityViewIsModal>
      <Text style={[styles.brand, compact && styles.compactBrand]}>PocketLedger</Text>
      <Text style={styles.title}>{!state.ready ? 'Checking security' : 'App locked'}</Text>
      <Text style={styles.caption}>{state.error ?? (state.ready
        ? 'Use your phone’s Face ID, fingerprint, or device passcode to continue.'
        : 'Your financial screens stay hidden until security settings are checked.')}</Text>
      {state.busy ? <ActivityIndicator color={colors.primary} size="large" /> :
        <Pressable accessibilityRole="button" style={styles.button}
          onPress={() => void (state.ready ? controller.unlock() : controller.initialize())}>
          <Text style={styles.buttonText}>{state.ready ? 'Unlock' : 'Retry'}</Text>
        </Pressable>}
      {state.ready && !state.busy && <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => {}); }}>
        <Text style={styles.link}>Open device settings</Text></Pressable>}
      </View>
    </Screen>}
  </AppLockContext.Provider>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxxl },
  lockContent: { alignItems: 'center', gap: spacing.xl },
  brand: { color: colors.primary, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  compactBrand: { fontSize: 20, maxWidth: '100%' },
  title: { color: colors.text, fontSize: 22, fontWeight: '600', textAlign: 'center' },
  caption: { color: colors.textSecondary, textAlign: 'center', fontSize: 15, lineHeight: 23 },
  button: { backgroundColor: colors.primarySolid, paddingHorizontal: 40, paddingVertical: 16, borderRadius: 14 },
  buttonText: { color: colors.textInverse, fontSize: 17, fontWeight: '700' },
  link: { color: colors.primary, padding: spacing.md },
}));
