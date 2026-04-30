# MMM-BSR-Trash-Calendar

MagicMirror² module for Berlin trash pickup dates. It shows upcoming collections from
**BSR** and, optionally, **Berlin Recycling**, with category colors, icons, warnings,
today/tomorrow highlights, caching, and automatic refresh.

![Module screenshot placeholder](docs/screenshot.png)
_Upcoming pickup dates with color-coded waste categories._

## Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration Recipes](#configuration-recipes)
- [Configuration Reference](#configuration-reference)
- [Berlin Recycling](#berlin-recycling)
- [API and Cache Behavior](#api-and-cache-behavior)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Features

- Resolves Berlin street address to BSR address key automatically.
- Supports direct `addressKey` config to skip address lookup.
- Displays upcoming pickup dates in chronological order.
- Supports BSR categories and optional Berlin Recycling paper/glass/commercial dates.
- Filters displayed dates with one shared `categories` list.
- Highlights pickups due today or tomorrow.
- Shows provider warnings, for example holiday rescheduling.
- Caches data in `cache.json` to reduce API calls and survive restarts.
- Retries API failures with exponential backoff: 5, 10, 20, 40, 80, 120 minutes.

## Installation

### 1. Clone into MagicMirror modules

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
```

### 2. Install production dependencies

```bash
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

### 3. Add module to `config.js`

Open `~/MagicMirror/config/config.js` and add one of the configuration recipes below to
the `modules` array.

### 4. Restart MagicMirror

```bash
pm2 restart MagicMirror
# or, for local installs
npm run start
```

## Configuration Recipes

### BSR only

Use street and house number. The module resolves the BSR address key automatically.

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  header: "Abfuhrtermine",
  config: {
    street: "Bergmannstr.",
    houseNumber: "12"
  }
}
```

### BSR with direct address key

Use this if you already know the BSR address key and want to skip address lookup.

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  config: {
    addressKey: "10965_Bergmannstr._12"
  }
}
```

`addressKey` is BSR-specific. Berlin Recycling does not use it; portal dates come from
the credentials in `.env`.

Address lookup URL example:

```text
https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet?searchQuery=Bergmannstr.:::12
```

### BSR plus Berlin Recycling

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  header: "Abfuhrtermine",
  config: {
    street: "Bergmannstr.",
    houseNumber: "12",
    categories: ["HM", "BI", "WS", "PP", "GL"],
    berlinRecycling: {
      enabled: true,
      usePortal: true,
      usePublicFallback: false
    }
  }
}
```

### Full example

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  header: "Abfuhrtermine",
  config: {
    // Required: either addressKey OR street + houseNumber
    street: "Bergmannstr.",
    houseNumber: "12",
    // addressKey: "10965_Bergmannstr._12",

    // Display
    dateFormat: "dd.MM.yyyy",
    maxEntries: 5,
    categories: ["BI", "HM", "LT", "WS", "WB", "PP", "GL", "GW"],
    debug: false,

    // Refresh
    updateInterval: 86400000,

    // Optional second provider
    berlinRecycling: {
      enabled: false,
      usePortal: true,
      usePublicFallback: false
    }
  }
}
```

## Configuration Reference

| Parameter         | Type       | Default                                                         | Required | Description                                                                                              |
| ----------------- | ---------- | --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `street`          | `string`   | -                                                               | Yes¹     | Berlin street name as used by BSR, for example `"Bergmannstr."`.                                         |
| `houseNumber`     | `string`   | -                                                               | Yes¹     | House number, for example `"12"` or `"4a"`.                                                              |
| `addressKey`      | `string`   | -                                                               | Yes¹     | BSR address key. If set, skips address lookup.                                                           |
| `dateFormat`      | `string`   | `"dd.MM.yyyy"`                                                  | No       | Date format. Supported tokens: `dd`, `MM`, `yyyy`, `yy`.                                                 |
| `maxEntries`      | `number`   | `5`                                                             | No       | Maximum number of upcoming dates shown.                                                                  |
| `updateInterval`  | `number`   | `86400000`                                                      | No       | Refresh interval in milliseconds. Default is 24 hours.                                                   |
| `categories`      | `string[]` | `["BI", "HM", "LT", "WS", "WB", "PP", "GL", "GW"]`              | No       | Categories shown from all providers. Empty or invalid lists fall back to all categories.                 |
| `debug`           | `boolean`  | `false`                                                         | No       | Enables detailed Node helper logs for cache, API, provider, merge, retry, and scheduling decisions.      |
| `berlinRecycling` | `object`   | `{ enabled: false, usePortal: true, usePublicFallback: false }` | No       | Optional Berlin Recycling provider. Portal credentials come from environment variables, not `config.js`. |

¹ Provide either `addressKey` or both `street` and `houseNumber`.

## Categories

| Code | Name           | Provider         | Icon             |
| ---- | -------------- | ---------------- | ---------------- |
| `BI` | Biogut         | BSR              | `fa-seedling`    |
| `HM` | Hausmüll       | BSR              | `fa-trash`       |
| `LT` | Laubtonne      | BSR              | `fa-leaf`        |
| `WS` | Wertstoffe     | BSR              | `fa-recycle`     |
| `WB` | Weihnachtsbaum | BSR              | `fa-tree`        |
| `PP` | Papier         | Berlin Recycling | `fa-newspaper`   |
| `GL` | Glas           | Berlin Recycling | `fa-wine-bottle` |
| `GW` | Gewerbeabfall  | Berlin Recycling | `fa-dumpster`    |

Category filter examples:

```javascript
categories: ["HM", "BI", "WS"]; // BSR only
categories: ["HM", "BI", "PP", "GL"]; // BSR + Berlin Recycling
categories: ["PP"]; // Berlin Recycling paper only
```

## Berlin Recycling

Enable Berlin Recycling in module config:

```javascript
berlinRecycling: {
  enabled: true,
  usePortal: true,
  usePublicFallback: false
}
```

Portal credentials can live in a `.env` file in this module directory:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
BERLIN_RECYCLING_USERNAME=your-login
BERLIN_RECYCLING_PASSWORD=your-password
```

Restart MagicMirror after changing `.env`. Credentials are never written to `cache.json`
and `.env` is ignored by git.

Provider behavior:

- `usePortal: true`: try authenticated Berlin Recycling portal first.
- `usePublicFallback: false`: default. No working public Berlin Recycling endpoint is known.
- `usePublicFallback: true`: accepted for config compatibility, but currently logs an
  unsupported-provider warning and returns no Berlin Recycling dates.
- `addressKey` is not used by Berlin Recycling.
- Berlin Recycling failures do not hide successful BSR dates.

## API and Cache Behavior

### BSR API

No API key needed.

```text
GET https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet
    ?searchQuery={street}:::{houseNumber}
```

```text
GET https://umapi.bsr.de/p/de.bsr.adressen.app/abfuhrEvents
    ?filter=AddrKey eq '{addressKey}'
      and DateFrom eq datetime'{year}-{month}-01T00:00:00'
      and DateTo eq datetime'{year}-{month}-{lastDay}T00:00:00'
```

The module fetches the current and following month, then merges dates from enabled
providers.

### Cache

Runtime cache lives in `cache.json` inside the module directory:

```json
{
  "street": "Bergmannstr.",
  "houseNumber": "12",
  "addressKey": "10965_Bergmannstr._12",
  "pickupDates": [],
  "lastFetchTimestamp": 1712345678901
}
```

Cache refreshes when:

- configured address changes,
- `updateInterval` has elapsed,
- cache is missing, unreadable, or corrupted,
- no future pickup dates remain.

Force fresh data:

```bash
pm2 stop MagicMirror
rm ~/MagicMirror/modules/MMM-BSR-Trash-Calendar/cache.json
pm2 start MagicMirror
```

## Troubleshooting

| Problem                    | Fix                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Adresse nicht gefunden`   | Check spelling against the BSR website, or use `addressKey` directly.                                  |
| Stale data                 | Delete `cache.json` and restart MagicMirror.                                                           |
| No Berlin Recycling dates  | Check `.env` credentials, portal access, and BR categories like `PP` or `GL` in `categories`.          |
| No data after restart      | Check MagicMirror logs for `[MMM-BSR-Trash-Calendar]`. API retry runs automatically.                   |
| Need more debug detail     | Set `debug: true` in module config, restart MagicMirror, then check logs for cache/API/provider steps. |
| Too many or few entries    | Adjust `maxEntries`.                                                                                   |
| Wrong categories displayed | Adjust `categories`; it filters all providers.                                                         |

## Development

```bash
npm install
npm run lint
npm run format:check
npm test
npm run test:unit
npm run test:property
npm run test:integration
```

Live BSR API tests are skipped by default:

```bash
BSR_LIVE_TESTS=true npx vitest run tests/integration/bsr-api.test.js
```

## License

MIT
