import { type RefObject, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';

import { migrateDatabase } from '../database';
import { syncRecurringReminders, syncAllScheduledNotifications } from '../services';
import { AppLockProvider } from '../components/AppLockProvider';
import { ErrorBoundary } from '../ErrorBoundary';
import { ThemeProvider, useTheme } from '../theme';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function RootLayout() {
  // Persist across lock/unlock remounts so the last notification isn't replayed.
  const handledNotificationId = useRef<string | null>(null);
  return (
    <ErrorBoundary>
      <SQLiteProvider
        databaseName="dailyfinance.db"
        onInit={migrateDatabase}
      >
        <ThemeProvider>
          <AppLockProvider>
            <NotificationCoordinator handledResponseId={handledNotificationId} />
            <RootStack />
          </AppLockProvider>
        </ThemeProvider>
      </SQLiteProvider>
    </ErrorBoundary>
  );
}

function RootStack() {
  const { colors } = useTheme();
  return <Stack
  screenOptions={{
    headerShown: false,
    contentStyle: { backgroundColor: colors.background },
  }}
>
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="budgets/index" />
  <Stack.Screen name="budgets/edit" />
  <Stack.Screen name="settings/security" />
  <Stack.Screen name="settings/appearance" />

  <Stack.Screen
    name="accounts/add"
    options={{
      presentation: 'modal',
    }}
  />
  <Stack.Screen
    name="categories/index"
    options={{
      presentation: 'card',
    }}
  />
  <Stack.Screen
    name="categories/add"
    options={{
      presentation: 'modal',
    }}
  />
  <Stack.Screen
    name="categories/edit/[id]"
    options={{
      presentation: 'modal',
    }}
  />
  <Stack.Screen
  name="transactions/add"
  options={{
    presentation: 'modal',
  }}
/>
<Stack.Screen
  name="transactions/[id]"
  options={{ presentation: 'card' }}
/>
<Stack.Screen
  name="transactions/edit/[id]"
  options={{ presentation: 'modal' }}
/>
<Stack.Screen
  name="transfers/add"
  options={{
    presentation: 'modal',
  }}
/>
<Stack.Screen
  name="settings/exchange-rate"
  options={{
    presentation: 'card',
  }}
/>
<Stack.Screen
  name="settings/notifications"
  options={{
    presentation: 'card',
  }}
/>
<Stack.Screen
  name="savings/add"
  options={{
    presentation: 'modal',
  }}
/>
<Stack.Screen
  name="savings/[id]"
  options={{
    presentation: 'card',
  }}
/>

<Stack.Screen
  name="savings/edit/[id]"
  options={{
    presentation: 'modal',
  }}
/>
<Stack.Screen
  name="recurring/index"
  options={{
    presentation: 'card',
  }}
/>

<Stack.Screen
  name="recurring/add"
  options={{
    presentation: 'modal',
  }}
/>

<Stack.Screen
  name="recurring/[id]"
  options={{
    presentation: 'card',
  }}
/>
<Stack.Screen
  name="recurring/edit/[id]"
  options={{
    presentation: 'modal',
  }}
/>
</Stack>;
}

function NotificationCoordinator({ handledResponseId }: { handledResponseId: RefObject<string | null> }) {
  const db = useSQLiteContext();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    // Sync all scheduled notification types on every app launch.
    // Recurring reminders are synced separately because they produce many
    // individual scheduled notifications (one per due date), whereas
    // syncAllScheduledNotifications handles the daily and weekly repeating ones.
    Promise.all([
      syncRecurringReminders(db),
      syncAllScheduledNotifications(db),
    ]).catch((error) => {
      console.error('Failed to synchronize notifications:', error);
    });
  }, [db]);

  useEffect(() => {
    if (!response) return;

    const notificationId = response.notification.request.identifier;
    if (handledResponseId.current === notificationId) return;

    const data = response.notification.request.content.data ?? {};
    const kind = data?.kind as string | undefined;
    const recurringId = data?.recurringId;
    const accountId = data?.accountId;

    handledResponseId.current = notificationId;

    if (kind === 'recurring-payment' && typeof recurringId === 'string') {
      router.push({ pathname: '/recurring/[id]', params: { id: recurringId } });
    } else if (kind === 'low-balance' && typeof accountId === 'string') {
      router.push({ pathname: '/accounts/[id]', params: { id: accountId } });
    } else if (kind === 'weekly-summary') {
      router.push('/(tabs)/reports');
    }
    // daily-reminder taps open the app to wherever the user last was — no action needed.
  }, [response]);

  return null;
}
