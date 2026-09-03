/**
 * ErrorBoundary
 *
 * Catches unhandled render/lifecycle errors anywhere in the component tree
 * below it and shows a recoverable error screen instead of a blank white crash.
 *
 * React Error Boundaries must be class components — hooks cannot catch
 * render-phase errors. This is one of the very few legitimate uses of a
 * React class component in a modern codebase.
 *
 * Usage in _layout.tsx:
 *   <ErrorBoundary>
 *     <RestOfApp />
 *   </ErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  /** Optional label shown above the error detail. Defaults to "PocketLedger". */
  appName?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production you would forward this to a crash-reporting service.
    // For now we log to the console so it still appears in Metro / Flipper.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <Ionicons name="warning-outline" size={40} color="#C62828" />
          </View>

          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            {this.props.appName ?? 'PocketLedger'} ran into an unexpected error.
            Your data is safe — this happened in the interface only.
          </Text>

          {__DEV__ && this.state.errorMessage ? (
            <View style={styles.devDetail}>
              <Text style={styles.devLabel}>Error detail (dev only)</Text>
              <Text style={styles.devMessage} selectable>
                {this.state.errorMessage}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={styles.retryButton}
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="Try to recover from the error"
          >
            <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
            <Text style={styles.retryText}>Try to recover</Text>
          </Pressable>

          <Text style={styles.hint}>
            If this keeps happening, restart the app. Your financial data is stored
            locally and will not be lost.
          </Text>
        </View>
      </SafeAreaView>
    );
  }
}

// Static styles — no theme access here since the ThemeProvider itself may be
// what crashed. Use hardcoded neutral values that work in both light and dark.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1420',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#172131',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 16,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#40202A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#F3F6FC',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#BAC6D8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  devDetail: {
    width: '100%',
    backgroundColor: '#0D1420',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  devLabel: {
    color: '#F6CD76',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  devMessage: {
    color: '#FF9CA9',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: '#9BAAC0',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
