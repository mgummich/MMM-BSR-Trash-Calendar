# API and Cache

How the module gets its data, what it stores, and when it asks again.

## Fetch cycle

```text
start / interval / retry tick
        │
        ├─ cache valid and not expired? ──▶ render from cache (no network)
        │
        └─ otherwise ──▶ BSR (required)  ─┐
                         Berlin Recycling ├─▶ merge + sort ─▶ write cache.json ─▶ render
                         (optional)      ─┘
```

- **BSR is required.** If it fails, the cycle fails and the retry backoff starts.
- **Berlin Recycling is optional.** If it fails, its cached dates are kept and the cycle
  still succeeds.

## BSR API

Public, no API key.

**Address lookup** — only when `addressKey` is not configured:

```text
GET https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet
    ?searchQuery={street}:::{houseNumber}
```

**Pickup dates:**

```text
GET https://umapi.bsr.de/p/de.bsr.adressen.app/abfuhrEvents
    ?filter=AddrKey eq '{addressKey}'
      and DateFrom eq datetime'{year}-{month}-01T00:00:00'
      and DateTo eq datetime'{year}-{month}-{lastDay}T00:00:00'
```

The module requests the **current and the following month**, so the list never runs dry at
a month boundary. December rolls over to January of the next year correctly.

Filter values are URL-encoded before the request is sent.

## Cache

`cache.json` lives in the module directory and survives restarts.

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

`providerDates` holds **raw, unfiltered** dates from every enabled provider. Category
filtering and icon embedding happen on read — which is why changing `categories` applies
immediately, with no refetch.

`cacheKey` encodes the cache-format version, the configured address, and the set of
enabled providers. Comparing one string is what makes invalidation reliable.

Caches written by older versions (with a `pickupDates` key) are still read, and are
upgraded to the current format on the next successful fetch.

### When the cache is refreshed

- the configured address changed,
- the set of enabled providers changed,
- `updateInterval` has elapsed,
- `cache.json` is missing, unreadable, or corrupted,
- no future pickup dates remain.

### Forcing fresh data

```bash
pm2 stop MagicMirror
rm ~/MagicMirror/modules/MMM-BSR-Trash-Calendar/cache.json
pm2 start MagicMirror
```

`cache.json` contains your address and BSR address key. Never commit it, and redact it
before sharing.

## Retry backoff

When a required fetch (BSR) fails, the module retries with exponential backoff, capped:

```text
min(5 × 2^attempts, 120) minutes  ──▶  5, 10, 20, 40, 80, 120, 120, …
```

While a retry cycle is active the regular `updateInterval` timer is suspended, so the two
schedules never race. On the first success the retry counter resets, the timer is cleared,
and normal interval scheduling resumes. Cached data stays on screen throughout — a failed
fetch never blanks the display.

## Being a good API citizen

The defaults exist to keep request volume low: one fetch per day, results cached on disk,
capped backoff on failure, and address lookup skipped entirely when `addressKey` is set.
If you shorten `updateInterval`, keep it well above the `60000` ms floor — pickup
calendars change at most a few times a year.
