# Security

PocketLedger keeps data on the device. There is no account, no server, and no remote push token.

## App lock

Optional. Off by default.

- **More → Security** stores an enabled flag in the iOS Keychain / Android Keystore via `expo-secure-store`.
- Unlock uses `expo-local-authentication`: Face ID, fingerprint, or the **device** PIN/passcode.
- PocketLedger does not implement its own PIN and never receives biometric templates or the device passcode.
- While locked, financial screens are not mounted. Notification deep links wait until unlock.

Limitations to be honest about:

- This is an access gate, not full-disk encryption of SQLite.
- iOS/Android backups may still include the database depending on the OS.
- Exported CSV/PDF/Excel files are **not** encrypted. The share sheet is the user's choice of destination.

SQLCipher (database encryption at rest) is a possible later change. It was skipped in V1 to keep the first personal install simple.

## Local notifications

Reminders are scheduled on-device (`expo-notifications`). The app does **not** register for APNs or FCM.

`plugins/withLocalNotifications.cjs` strips `aps-environment` and the `remote-notification` background mode so a **free** Apple developer team can still build. Recurring dues, the daily log reminder, the weekly summary, and low-balance alerts all use this local path.

## What is stored where

| Data | Storage |
| --- | --- |
| Transactions, accounts, settings | SQLite (`dailyfinance.db` — internal filename, unchanged to avoid wiping existing installs) |
| App-lock enabled flag | SecureStore |
| Export files | App cache, then the system share sheet |

## Face ID usage string

iOS asks for Face ID with: “Allow PocketLedger to use Face ID to unlock your financial information.”
