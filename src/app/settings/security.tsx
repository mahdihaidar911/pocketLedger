import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Screen } from '../../components';
import { useAppLock } from '../../components/AppLockProvider';
import { createThemedStyles, useTheme, spacing } from '../../theme';

export default function SecuritySettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { state, controller } = useAppLock();
  return <Screen scroll contentStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>‹ Back</Text></Pressable>
    <Text style={styles.title}>Security</Text>
    <Card>
      <View style={styles.row}>
        <View style={styles.description}>
          <Text style={styles.label}>App lock</Text>
          <Text style={styles.caption}>Require your phone’s authentication when opening or returning to PocketLedger.</Text>
        </View>
        <Switch accessibilityLabel="App lock" value={state.enabled} disabled={state.busy || Platform.OS === 'web'}
          trackColor={{ false: colors.border, true: colors.switchTrack }}
          thumbColor={state.enabled ? colors.primary : colors.surface}
          onValueChange={(value) => { void controller.setEnabled(value); }} />
      </View>
    </Card>
    <Text style={styles.caption}>Uses Face ID, Touch ID, fingerprint, or your existing device PIN/passcode. PocketLedger never sees or stores your passcode. Enabling and disabling both require authentication.</Text>
    <Text style={styles.caption}>The app locks when it becomes inactive or leaves the foreground. Save any edits first: open forms are closed when locked.</Text>
    <Text style={styles.caption}>This protects access to the app, not database encryption or files you export. Existing reminder notifications may still show details outside the app; manage notification previews in your phone’s settings.</Text>
    <Text style={styles.caption}>Face ID requires a development or standalone iOS build, not Expo Go. Keep a working device passcode as your fallback.</Text>
    {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
    {state.enabled && <Pressable accessibilityRole="button" disabled={state.busy} style={styles.button} onPress={() => controller.lockNow()}>
      <Text style={styles.buttonText}>Lock Now</Text></Pressable>}
    {Platform.OS === 'web' && <Text style={styles.caption}>App lock is available on iOS and Android only.</Text>}
  </Screen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: 80 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  link: { color: colors.primary, fontWeight: '600', paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  description: { flex: 1 },
  label: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  caption: { fontSize: 14, lineHeight: 22, color: colors.textSecondary },
  error: { color: colors.danger, lineHeight: 22 },
  button: { padding: spacing.lg, borderRadius: 14, backgroundColor: colors.primarySolid, alignItems: 'center' },
  buttonText: { color: colors.textInverse, fontSize: 16, fontWeight: '700' },
}));
