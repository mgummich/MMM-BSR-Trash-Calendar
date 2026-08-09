<h1 align="center">MMM-BSR-Trash-Calendar</h1>

<p align="center">
  Upcoming Berlin trash pickup dates on your MagicMirror².<br>
  <b>BSR</b> collections, optional <b>Berlin Recycling</b> paper/glass/commercial dates —
  color-coded, icon-labelled, cached and self-refreshing.
</p>

<p align="center">
  <img alt="MagicMirror²" src="https://img.shields.io/badge/MagicMirror%C2%B2-module-000000">
  <img alt="Node" src="https://img.shields.io/badge/node-%5E20.19%20%7C%7C%20%3E%3D22.12-5FA04E">
  <img alt="Tests" src="https://img.shields.io/badge/tests-vitest-6E9F18">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
</p>

## Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration Recipes](#configuration-recipes)
- [Configuration Reference](#configuration-reference)
- [Categories](#categories)
- [Berlin Recycling](#berlin-recycling)
- [API and Cache Behavior](#api-and-cache-behavior)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Features

|                         |                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 📍 **Address lookup**   | Resolves a Berlin street + house number to the BSR address key, or takes an `addressKey` directly.       |
| 🗓️ **Merged calendar**  | BSR categories plus optional Berlin Recycling paper, glass and commercial dates, in chronological order. |
| 🎨 **Category styling** | Per-category color, Font Awesome icon and bundled SVG for the BSR fractions.                             |
| 🔎 **One filter list**  | A single `categories` list filters every provider; changes apply instantly, without a refetch.           |
| ⏰ **Today / tomorrow** | Imminent pickups are highlighted, provider warnings (e.g. holiday shifts) are shown.                     |
| 💾 **Durable cache**    | `cache.json` survives restarts and cuts API calls; a failing optional provider keeps its cached dates.   |
| 🔁 **Backoff retries**  | API failures retry after 5, 10, 20, 40, 80, 120 minutes.                                                 |

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
      usePortal: true
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
      usePortal: true
    }
  }
}
```

## Configuration Reference

| Parameter         | Type       | Default                                            | Required | Description                                                                                                                                                   |
| ----------------- | ---------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `street`          | `string`   | -                                                  | Yes¹     | Berlin street name as used by BSR, for example `"Bergmannstr."`.                                                                                              |
| `houseNumber`     | `string`   | -                                                  | Yes¹     | House number, for example `"12"` or `"4a"`.                                                                                                                   |
| `addressKey`      | `string`   | -                                                  | Yes¹     | BSR address key. If set, skips address lookup.                                                                                                                |
| `dateFormat`      | `string`   | `"dd.MM.yyyy"`                                     | No       | Date format. Supported tokens: `dd`, `MM`, `yyyy`, `yy`.                                                                                                      |
| `maxEntries`      | `number`   | `5`                                                | No       | Maximum number of upcoming dates shown.                                                                                                                       |
| `updateInterval`  | `number`   | `86400000`                                         | No       | Refresh interval in milliseconds. Default is 24 hours.                                                                                                        |
| `categories`      | `string[]` | `["BI", "HM", "LT", "WS", "WB", "PP", "GL", "GW"]` | No       | Categories shown from all providers. Empty or invalid lists fall back to all categories.                                                                      |
| `debug`           | `boolean`  | `false`                                            | No       | Enables detailed Node helper logs for cache, API, provider, merge, retry, and scheduling decisions.                                                           |
| `berlinRecycling` | `object`   | `{ enabled: false, usePortal: true }`              | No       | Optional Berlin Recycling provider. Active only with `enabled: true` **and** `usePortal: true`; credentials come from environment variables, not `config.js`. |

¹ Provide either `addressKey` or both `street` and `houseNumber`.

## Categories

| Code | Name           | Provider         | Icon             | Color     | Bundled SVG |
| ---- | -------------- | ---------------- | ---------------- | --------- | ----------- |
| `BI` | Biogut         | BSR              | `fa-seedling`    | `#8B4513` | ✅ `BI.svg` |
| `HM` | Hausmüll       | BSR              | `fa-trash`       | `#808080` | ✅ `HM.svg` |
| `LT` | Laubtonne      | BSR              | `fa-leaf`        | `#228B22` | ✅ `LT.svg` |
| `WS` | Wertstoffe     | BSR              | `fa-recycle`     | `#FFD700` | ✅ `WS.svg` |
| `WB` | Weihnachtsbaum | BSR              | `fa-tree`        | `#006400` | ✅ `WB.svg` |
| `PP` | Papier         | Berlin Recycling | `fa-newspaper`   | `#1E88E5` | –           |
| `GL` | Glas           | Berlin Recycling | `fa-wine-bottle` | `#43A047` | –           |
| `GW` | Gewerbeabfall  | Berlin Recycling | `fa-dumpster`    | `#6D4C41` | –           |

Categories without a bundled SVG fall back to their Font Awesome icon.

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
  usePortal: true
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

- `usePortal: true` is required — dates come from the authenticated customer portal.
  With `enabled: true, usePortal: false` the provider stays inactive.
- The portal has no public API. The provider logs in, carries the session cookies through
  a fixed request chain and reads the `ABFUHRKALENDER` dataset.
- `addressKey` is not used by Berlin Recycling; the account determines the address.
- Berlin Recycling is an _optional_ provider: a failed fetch never aborts the cycle, never
  hides BSR dates, and keeps its previously cached dates instead of dropping them.

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
  "cacheKey": "{\"version\":2,\"address\":{...},\"providers\":{...}}",
  "street": "Bergmannstr.",
  "houseNumber": "12",
  "addressKey": "10965_Bergmannstr._12",
  "providerDates": [],
  "lastFetchTimestamp": 1712345678901
}
```

`providerDates` holds the raw, unfiltered dates from every enabled provider. Category
filtering and icon embedding happen on read, so changing `categories` takes effect
immediately without a refetch. Caches written by older versions (`pickupDates`) are still
read and are upgraded on the next successful fetch.

Cache refreshes when:

- configured address changes,
- the set of enabled providers changes,
- `updateInterval` has elapsed,
- cache is missing, unreadable, or corrupted,
- no future pickup dates remain.

If an optional provider (Berlin Recycling) fails while BSR succeeds, its previously cached
dates are kept instead of being dropped from the cache.

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
npm install          # includes dev dependencies
npm run lint         # eslint
npm run lint:fix
npm run format       # prettier --write
npm run format:check
npm test             # all vitest suites
```

Single suites: `npm run test:unit`, `npm run test:property`, `npm run test:integration`.

Live BSR API tests are skipped by default:

```bash
BSR_LIVE_TESTS=true npx vitest run tests/integration/bsr-api.test.js
```

### Layout

```text
MMM-BSR-Trash-Calendar.js   frontend module (rendering, DOM)
node_helper.js              fetch cycle, cache, retry, socket notifications
utils.js                    categories, dates, cache keys, filtering
providers/bsr.js            BSR address lookup + pickup dates
providers/berlinRecyclingPortal.js   portal login + calendar fetch
providers/berlinRecyclingParse.js    pure parsing helpers
providers/merge.js          merge, filter and sort provider dates
icons/                      bundled SVGs for the BSR categories
tests/                      unit, property (fast-check) and integration suites
```

## License

MIT
