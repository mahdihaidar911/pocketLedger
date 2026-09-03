import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { AppLockAdapter } from './appLockController';

const KEY = 'dailyfinance.app-lock.enabled.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'dailyfinance.app-lock',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const appLockAdapter: AppLockAdapter = {
  async readEnabled() {
    if (Platform.OS === 'web') return false;
    if (!await SecureStore.isAvailableAsync()) throw new Error('Secure storage is unavailable.');
    const value = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (value === null || value === '0') return false;
    if (value === '1') return true;
    throw new Error('Invalid app-lock setting.');
  },
  async writeEnabled(enabled) {
    if (Platform.OS === 'web') throw new Error('App lock requires iOS or Android.');
    await SecureStore.setItemAsync(KEY, enabled ? '1' : '0', OPTIONS);
  },
  async authenticate() {
    if (Platform.OS === 'web') return { success: false, message: 'App lock is available on iOS and Android.' };
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return { success: false, message: 'Set a device passcode, PIN, or biometric unlock in your phone’s settings first.' };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock PocketLedger', cancelLabel: 'Cancel',
      fallbackLabel: 'Use Device Passcode', disableDeviceFallback: false,
      biometricsSecurityLevel: 'strong', requireConfirmation: true,
    });
    if (result.success) return { success: true };
    if (result.error === 'not_enrolled' || result.error === 'passcode_not_set') {
      return { success: false, message: 'Set up a device passcode or biometric unlock in your phone’s settings, then try again.' };
    }
    if (result.error === 'lockout') {
      return { success: false, message: 'Biometrics are temporarily locked. Use your device passcode or unlock your phone, then try again.' };
    }
    return { success: false, message: 'Authentication was not completed. Your data remains protected while locked.' };
  },
};
