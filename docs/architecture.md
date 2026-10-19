# Architecture

PocketLedger is a local-only mobile app. SQLite is the source of truth. Screens never write SQL.

## Layers

| Layer | Role |
| --- | --- |
| `src/app` | Expo Router screens. Load data, collect input, call repositories/services. |
| `src/hooks` | Focus-aware loaders (`useDashboard`, `useActivityHistory`, `useMonthlyBudgets`). |
| `src/services` | Cross-cutting behavior: dashboard aggregation, notifications, export, app lock, appearance. |
| `src/repositories` | Parameterized queries and money writes. |
| `src/database/migrate.ts` | Versioned schema. Current version: **10**. |
| `src/theme` | Light / dark / system palettes and `createThemedStyles`. |

## Money

- USD is stored in **cents** (`amount_minor`).
- LBP is stored in **whole lira** (no decimal subunit in this product).
- Parsing and formatting live in `src/utils/money.ts`. Arithmetic uses `Number.isSafeInteger` checks.
- Account balances are updated inside `withExclusiveTransactionAsync` so a row insert and a balance change commit together or roll back together.

## Dual currency

`Currency` and `Account type` are separate. A user can have Cash USD and Cash LBP.

`exchange_rates` holds the rate the user sets (LBP per 1 USD). Each transaction and transfer that needs conversion stores `exchange_rate_lbp_per_usd` on the row. Reports that need a USD-equivalent total for mixed-currency periods use the **current** rate only as a display convenience; historical rows keep the rate they were saved with.

## Entities

- **accounts** — name, type, currency, `balance_minor`, optional low-balance threshold, active flag
- **categories** — expense or income, unique name per kind, default vs custom, active flag
- **transactions** — expense or income; never used for transfers
- **transfers** — source and destination accounts, amounts, optional FX
- **savings_goals** — linked to an account; contributions are not spending
- **recurring_payments** — schedule only; posting a due item creates a normal transaction after confirmation
- **monthly_budgets** — per month, category, and currency
- **app_settings** — appearance, notification preferences

Inactive accounts and categories remain on historical rows (`ON DELETE RESTRICT` / `SET NULL`). They disappear from pickers.

## Concurrency

Edits and deletes pass `expectedUpdatedAt`. If the row changed, the write is rejected instead of overwriting. Balance overflow beyond `Number.MAX_SAFE_INTEGER` is rejected.

## Future sync

IDs are UUIDs. Rows have `created_at` / `updated_at`. A later sync engine can replicate tables without changing the money rules. There is no user table in V1; the device is the user.
