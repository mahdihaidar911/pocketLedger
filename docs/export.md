# Export

From **Transactions**, **Export** offers three formats for **all rows matching the current filters**, not only the loaded page.

| Format | Library | Notes |
| --- | --- | --- |
| CSV | Built in | UTF-8 BOM, quoted fields, local timestamps, formula-safe text |
| PDF | `expo-print` | HTML rendered by the native print engine, then the share sheet |
| Excel | ExcelJS | `.xlsx` with an Activity sheet and a Summary sheet |

The file is written to a private cache directory with a unique name. PocketLedger opens the system share sheet. It does not pick a recipient, upload the file, or encrypt it.

## CSV rules

- Internal IDs are omitted.
- USD amounts are exact decimals; LBP amounts are whole units.
- Transfers include both sides (source and destination).
- Cells that look like spreadsheet formulas (`=`, `+`, `-`, `@`) are prefixed so Numbers/Excel do not execute them.

## Privacy

Treat exports as copies of your ledger. Once they leave the app, PocketLedger's app lock no longer applies.
