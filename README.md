# PocketLedger

Offline-first personal finance for iOS and Android. Track daily spending across **USD and Lebanese Lira**, keep account balances correct, and review reports without an internet connection.

PocketLedger is a real product I built for my own use — dual-currency money, transfers that are not treated as spending, historical exchange rates, and a biometric lock. It is not a cloud app and it does not require an account.

## Why this exists

In Lebanon, cash and wallets often live in two currencies at once. Most expense trackers either ignore LBP or convert everything at whatever rate is current today, which rewrites history.

PocketLedger stores every amount as an integer (USD cents, whole LBP), records the USD/LBP rate **on the transaction**, and never recalculates old reports when the rate changes.

## What it does

- **Accounts** — cash, wallets, and savings with currency, balance, and optional low-balance threshold
- **Expenses, income, transfers** — transfers move money between your own accounts and stay out of spending totals
- **USD + LBP** — configurable rate; historical conversions stay frozen
- **Search and filters** — type, account, date range, merchant, category, amount
- **Savings goals** — dedicated balances that are not treated as spending
- **Recurring payments** — due-date reminders; nothing is posted until you confirm
- **Reports** — monthly or custom range, account filter, category totals, USD-equivalent summary
- **Export** — CSV, PDF, or Excel of the current search (share sheet; files are not encrypted)
- **Notifications** — daily log reminder, weekly summary, recurring dues, low-balance alerts
- **Security** — optional Face ID / Android biometrics / device passcode; app lock on background

## Architecture

```
Screens (Expo Router)
        │
        ▼
Hooks          Theme / App lock
        │
        ▼
Services (dashboard, export, reminders, lock)
        │
        ▼
Repositories (parameterized SQL)
        │
        ▼
SQLite (WAL, foreign keys, versioned migrations)
```

SQLite is the source of truth. The UI never writes SQL. Sync-to-cloud later would sit beside the repository layer; it is not required for V1.

More detail: [Architecture](docs/architecture.md) · [Security](docs/security.md) · [Export](docs/export.md)

## Design decisions

| Decision | Why |
| --- | --- |
| Integer minor units, never floats | `$10.10` stored as `1010`. Avoids rounding bugs in balances and reports. |
| Exchange rate stored per transaction | Changing today's rate must not rewrite last month's USD equivalent. |
| Transfers in a separate table | A move from Cash USD to Whish USD is not income and not an expense. |
| Exclusive SQLite transactions | Balance + row write succeed together, or both roll back. |
| Stale `updated_at` checks | Two overlapping edits cannot silently overwrite each other. |
| Soft-deactivate accounts/categories | History stays readable after you retire a wallet or category. |
| Local notifications only | No push token, no APNs entitlement — works on a free Apple developer team. |
| Device biometrics, not an app PIN | The OS already has a PIN. PocketLedger never sees or stores it. |

## Stack

- Expo SDK 57, React Native, TypeScript
- Expo Router (file-based navigation)
- `expo-sqlite` with numbered migrations (currently v10)
- `expo-secure-store` + `expo-local-authentication`
- `expo-notifications`, `expo-print`, ExcelJS
- Node.js test runner (`node --test`) against the real repository code

## Tests

Financial logic is tested without a simulator: in-memory SQLite, the same migrations and repositories the app uses.

```bash
npm test
npx tsc --noEmit
```

Coverage includes balance arithmetic, transfer isolation, stale edits, rollback, activity search, CSV safety (formula injection), budgets, app lock, appearance, and iOS notification config.

CI runs the same commands on every push: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Run locally

Requires Node 22.13+.

```bash
npm install
npx expo start
```

Then open a development build, iOS simulator, or Android emulator. Expo Go is not enough: SQLite, secure store, biometrics, and local notifications need a native build.

### Install on a physical iPhone

```bash
npx expo prebuild --clean --platform ios
open ios/PocketLedger.xcworkspace
```

In Xcode: enable automatic signing, select your iPhone, press ⌘R. Trust the developer certificate on the device under **Settings → General → VPN & Device Management**.

Xcode must have **iOS device support** for the version on your phone (Apple bundles the simulator runtime in the same download). A free Apple ID works; personal-team builds expire after 7 days and need a rebuild.

## What is not in this version

Intentionally deferred: cloud sync, family sharing, receipt OCR, SQLCipher encryption at rest, App Store listing.

The schema uses stable IDs and timestamps so sync can be added later without rebuilding the money model.

## License

MIT. See [LICENSE](LICENSE).
