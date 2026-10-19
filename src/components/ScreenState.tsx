import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { createThemedStyles, useTheme, spacing, radius } from '../theme';

export function ScreenState({ title, message, loading = false, onRetry }: {
  title: string;
  message: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <Card>
    <View style={styles.content} accessibilityLiveRegion="polite">
      {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {!loading && onRetry && <Pressable accessibilityRole="button" style={styles.retry} onPress={onRetry}>
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>}
    </View>
  </Card>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  content: { gap: spacing.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  message: { color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  retry: { minHeight: 48, padding: spacing.md, backgroundColor: colors.primarySolid, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.textInverse, fontSize: 16, fontWeight: '700', textAlign: 'center' },
}));
