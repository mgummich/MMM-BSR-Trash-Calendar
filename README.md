# MMM-BSR-Trash-Calendar

A [MagicMirror²](https://magicmirror.builders/) module that displays upcoming trash pickup dates from the Berlin waste management services **BSR** (Berliner Stadtreinigung) for any configured Berlin address.

![Module screenshot placeholder](docs/screenshot.png)
_Screenshot: upcoming pickup dates with color-coded waste categories_

---

## Features

- Resolves any Berlin street address to a BSR address key automatically
- Displays upcoming pickup dates sorted chronologically
- Color-coded icons for each waste category (Biogut, Hausmüll, Laubtonne, Wertstoffe, Weihnachtsbaum)
- Highlights today's and tomorrow's pickups
- Shows BSR warning notices (e.g. holiday rescheduling) inline
- Persistent file-based cache — survives MagicMirror restarts without extra API calls
- Automatic refresh with configurable interval
- Exponential backoff retry on API errors (5 → 10 → 20 → 40 → 80 → 120 min)

---

## Installation

### 1. Clone the module

Navigate to your MagicMirror `modules` directory and clone the repository:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/your-username/MMM-BSR-Trash-Calendar.git
```

### 2. Install dependencies

```bash
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

### 3. Add the module to your config

Open `~/MagicMirror/config/config.js` and add the module entry to the `modules` array:

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  config: {
    street: "Bergmannstr.",
    houseNumber: "12"
  }
}
```

### 4. Restart MagicMirror

```bash
pm2 restart MagicMirror
# or
npm run start
```

---

## Configuration

### Minimal configuration (required fields only)

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  config: {
    street: "Bergmannstr.",
    houseNumber: "12"
  }
}
```

### Full configuration (all options)

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  header: "Abfuhrtermine",
  config: {
    // Required
    street: "Bergmannstr.",
    houseNumber: "12",

    // Optional
    dateFormat: "dd.MM.yyyy",
    maxEntries: 5,
    updateInterval: 86400000,
    categories: ["BI", "HM", "LT", "WS", "WB"]
  }
}
```

### Parameter reference

| Parameter        | Type       | Default                          | Required | Description                                                                                                                               |
| ---------------- | ---------- | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `street`         | `string`   | —                                | ✅ Yes   | Street name as used by BSR (e.g. `"Bergmannstr."`, `"Oranienstr."`)                                                                       |
| `houseNumber`    | `string`   | —                                | ✅ Yes   | House number (e.g. `"12"`, `"4a"`)                                                                                                        |
| `dateFormat`     | `string`   | `"dd.MM.yyyy"`                   | No       | Date format for pickup dates. Supported tokens: `dd`, `MM`, `yyyy`, `yy`                                                                  |
| `maxEntries`     | `number`   | `5`                              | No       | Maximum number of upcoming pickup dates to display                                                                                        |
| `updateInterval` | `number`   | `86400000` (24 h)                | No       | How often to refresh data from the BSR API, in milliseconds                                                                               |
| `categories`     | `string[]` | `["BI", "HM", "LT", "WS", "WB"]` | No       | Waste categories to display. Pass a subset to filter. Unknown codes are ignored with a warning. Empty array falls back to all categories. |

### Waste categories

| Code | Name           | Color      | Icon             |
| ---- | -------------- | ---------- | ---------------- |
| `BI` | Biogut         | Brown      | 🌱 `fa-seedling` |
| `HM` | Hausmüll       | Grey       | 🗑 `fa-trash`    |
| `LT` | Laubtonne      | Green      | 🍃 `fa-leaf`     |
| `WS` | Wertstoffe     | Yellow     | ♻️ `fa-recycle`  |
| `WB` | Weihnachtsbaum | Dark green | 🎄 `fa-tree`     |

---

## API Dependencies

This module communicates with the BSR public API at `umnewforms.bsr.de`. No API key is required.

### Endpoints

#### Address lookup

Resolves a street address to a BSR address key (`AddrKey`).

```
GET https://umnewforms.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet
    ?searchQuery={street}:::{houseNumber}
```

**Response format:**

```json
[
  {
    "value": "10965_Bergmannstr._12",
    "label": "Bergmannstr. 12, 10965 Berlin"
  }
]
```

The module uses `value` from the first result as the address key for subsequent calendar queries.

#### Pickup calendar

Fetches pickup events for a given address and month.

```
GET https://umnewforms.bsr.de/p/de.bsr.adressen.app/abfuhrEvents
    ?filter=AddrKey eq '{addressKey}'
      and DateFrom eq datetime'{year}-{month}-01T00:00:00'
      and DateTo eq datetime'{year}-{month}-01T00:00:00'
```

**Response format:**

```json
{
  "dates": {
    "2025-04-07": [
      {
        "category": "HM",
        "serviceDay": "Montag",
        "serviceDate_actual": "07.04.2025",
        "serviceDate_regular": "07.04.2025",
        "rhythm": "14-täglich",
        "warningText": "",
        "disposalComp": "BSR"
      }
    ]
  }
}
```

The module fetches data for the **current month and the following month** on each refresh cycle to ensure no upcoming dates are missed around month boundaries.

### Rate limiting & caching

The BSR API does not publish explicit rate limits. The module minimises requests by:

- Caching the resolved address key and pickup dates in `cache.json` (in the module directory)
- Skipping API calls on restart if the cache is still valid (interval not expired, future dates present)
- Invalidating the cache only when the configured address changes or the update interval expires
- Using exponential backoff on errors: 5 → 10 → 20 → 40 → 80 → 120 minutes (maximum)

---

## Caching

The module stores a `cache.json` file in its own directory with the following structure:

```json
{
  "street": "Bergmannstr.",
  "houseNumber": "12",
  "addressKey": "10965_Bergmannstr._12",
  "pickupDates": [ ... ],
  "lastFetchTimestamp": 1712345678901
}
```

The cache is automatically invalidated when:

- The configured address (street or house number) changes
- The `updateInterval` has elapsed since the last successful fetch
- The cache file is missing, corrupted, or unreadable

---

## Troubleshooting

**"Adresse nicht gefunden"** — The BSR API could not match the configured address. Double-check `street` and `houseNumber` against the [BSR website](https://www.bsr.de/abfuhrkalender).

**Module shows stale data** — Delete `cache.json` from the module directory and restart MagicMirror to force a fresh fetch.

**No data after restart** — Check the MagicMirror logs for `[MMM-BSR-Trash-Calendar]` entries. The BSR API may be temporarily unavailable; the module will retry automatically.

---

## Development

```bash
npm install
npm run lint          # ESLint
npm run format:check  # Prettier
npm test              # All tests (unit + property + integration)
npm run test:unit
npm run test:property
npm run test:integration
```

---

## License

MIT
