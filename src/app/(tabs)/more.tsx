import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, Screen } from '../../components';
import {
  createThemedStyles, useTheme,
  appearanceLabels,
  spacing,
} from '../../theme';

export default function MoreScreen() {
  const styles = useStyles();
  const { preference } = useTheme();
  return (
    <Screen bottomInset={false}
      scroll
      contentStyle={styles.content}
    >
      <Text style={styles.title}>
        More
      </Text>

      <Text style={styles.subtitle}>
        Manage your accounts, categories,
        recurring payments and app settings.
      </Text>

      <Text style={styles.sectionTitle}>
        Money
      </Text>

      <Card style={styles.menuCard}>
        <MenuRow icon="pie-chart-outline" title="Monthly Budgets"
          description="Category limits and spending progress" onPress={() => router.push('/budgets')} />
        <Divider />
        <MenuRow
          icon="wallet-outline"
          title="Accounts"
          description="Manage wallets and balances"
          onPress={() =>
            router.push('/accounts')
          }
        />

        <Divider />

        <MenuRow
          icon="pricetags-outline"
          title="Categories"
          description="Expense and income categories"
          onPress={() =>
            router.push('/categories')
          }
        />

        <Divider />

        <MenuRow
          icon="repeat-outline"
          title="Recurring Payments"
          description="Bills and subscriptions"
          onPress={() =>
  router.push(
    '/recurring'
  )
}
        />

        <Divider />

        <MenuRow
  icon="swap-horizontal-outline"
  title="Exchange Rate"
  description="USD and LBP conversion"
  onPress={() =>
    router.push(
      '/settings/exchange-rate'
    )
  }
/>
      </Card>

      <Text style={styles.sectionTitle}>
        Preferences
      </Text>

      <Card style={styles.menuCard}>
        <MenuRow
          icon="notifications-outline"
          title="Notifications"
          description="Reminders and alerts"
          onPress={() =>
            router.push(
              '/settings/notifications'
            )
          }
        />

        <Divider />

        <MenuRow
          icon="shield-checkmark-outline"
          title="Security"
          description="Face ID, fingerprint, or device passcode"
          onPress={() => router.push('/settings/security')}
        />

        <Divider />

        <MenuRow
          icon="moon-outline"
          title="Appearance"
          description={`${appearanceLabels[preference]} · Light and dark mode`}
          onPress={() => router.push('/settings/appearance')}
        />

        <Divider />

        <MenuRow
          icon="download-outline"
          title="Export Data"
          description="Filtered transaction CSV"
          onPress={() => router.push('/(tabs)/transactions')}
        />
      </Card>
    </Screen>
  );
}

function MenuRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      style={styles.menuRow}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
    >
      <View style={styles.menuLeft}>
        <Ionicons
          name={icon}
          size={21}
          color={colors.primary}
        />

        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>
            {title}
          </Text>

          <Text
            style={styles.menuDescription}
          >
            {description}
          </Text>
        </View>
      </View>

      {onPress && <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textMuted}
      />}
    </Pressable>
  );
}

function Divider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: {
    paddingBottom: 120,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },

  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.xxxl,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },

  menuCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xxxl,
  },

  menuRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  menuText: {
    marginLeft: spacing.md,
  },

  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  menuDescription: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
}));
