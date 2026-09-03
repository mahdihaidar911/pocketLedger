import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Screen } from '../../components';
import { appearanceLabels, createThemedStyles, spacing, useTheme, type AppearancePreference } from '../../theme';

const options: { value: AppearancePreference; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { value: 'system', icon: 'phone-portrait-outline', description: 'Follow your phone’s light or dark appearance automatically.' },
  { value: 'light', icon: 'sunny-outline', description: 'Always use a light background.' },
  { value: 'dark', icon: 'moon-outline', description: 'Always use a dark background.' },
];

export default function AppearanceSettingsScreen() {
  const styles = useStyles();
  const { colors, preference, scheme, saving, error, setPreference } = useTheme();
  return <Screen scroll contentStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
      <Text style={styles.back}>‹ Back</Text>
    </Pressable>
    <Text style={styles.title}>Appearance</Text>
    <Text style={styles.caption}>Choose how PocketLedger looks. Your choice is saved on this phone.</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance mode" style={styles.options}>
      {options.map((option) => {
        const selected = preference === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={appearanceLabels[option.value]}
          accessibilityHint={option.description} accessibilityState={{ checked: selected, disabled: saving }}
          aria-checked={selected} aria-disabled={saving}
          disabled={saving} onPress={() => void setPreference(option.value)}
          style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}>
          <Ionicons name={option.icon} color={selected ? colors.primary : colors.textSecondary} size={24} />
          <View style={styles.optionText}>
            <Text style={styles.label}>{appearanceLabels[option.value]}</Text>
            <Text style={styles.caption}>{option.description}</Text>
          </View>
          <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? colors.primary : colors.textMuted} size={23} />
        </Pressable>;
      })}
    </View>
    {saving && <View style={styles.saving} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} /><Text style={styles.caption}>Saving appearance…</Text>
    </View>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Card>
      <Text style={styles.label}>{scheme === 'dark' ? 'Dark' : 'Light'} appearance is active</Text>
      <Text style={styles.caption}>{preference === 'system'
        ? 'This changes whenever your phone changes appearance.'
        : 'This stays the same even if your phone changes appearance.'}</Text>
    </Card>
    <Text style={styles.caption}>Appearance does not change your balances, budgets, reminders, or app-lock protection.</Text>
  </Screen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 80 },
  back: { color: colors.primary, fontWeight: '600', paddingVertical: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  options: { gap: spacing.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, minHeight: 96 },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.75 },
  optionText: { flex: 1, gap: spacing.xs },
  label: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  saving: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
}));
