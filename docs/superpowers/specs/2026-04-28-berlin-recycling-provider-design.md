# Berlin Recycling Provider Design

## Goal

Add Berlin Recycling as an additional appointment provider for `MMM-BSR-Trash-Calendar`.
BSR stays primary and unchanged. Berlin Recycling dates are fetched, normalized, merged,
filtered by the existing `categories` option, cached with BSR dates, and rendered in the
existing MagicMirror UI.

## Scope

The feature adds both Berlin Recycling access modes:

- Authenticated customer portal fetch when credentials are available.
- Public tenant street-search fetch as fallback, or as primary Berlin Recycling source
  when credentials are missing.

The feature does not replace BSR address lookup or BSR pickup retrieval.

## Configuration

Add optional config:

```js
berlinRecycling: {
  enabled: true,
  usePortal: true,
  usePublicFallback: true
}
```

Credentials are read from environment variables, not MagicMirror `config.js`:

```sh
BERLIN_RECYCLING_USERNAME=...
BERLIN_RECYCLING_PASSWORD=...
```

If `berlinRecycling.enabled` is false or omitted, current behavior remains unchanged. If
portal fetch is enabled but credentials are missing, the module logs the condition and
uses public fallback when configured.

## Architecture

Split provider-specific HTTP and parsing logic out of `node_helper.js`:

- `providers/bsr.js`: existing BSR address and calendar API behavior.
- `providers/berlinRecyclingPortal.js`: login/session handling and portal calendar fetch.
- `providers/berlinRecyclingPublic.js`: public tenant street-search calendar fetch.
- `providers/merge.js`: normalize, deduplicate, filter, and sort `PickupDate[]`.

`node_helper.js` remains responsible for MagicMirror sockets, config validation, cache,
concurrency guard, retry scheduling, and provider orchestration.

## Data Model

Keep the existing `PickupDate` shape and add optional provider metadata only if needed
for deduplication/debugging:

```ts
type PickupDate = {
  date: string;
  category: string;
  categoryName: string;
  color: string;
  icon: string;
  disposalCompany: string;
  warningText: string;
  provider?: "BSR" | "BERLIN_RECYCLING";
};
```

Existing categories remain: `BI`, `HM`, `LT`, `WS`, `WB`. Add Berlin Recycling categories
as data confirms them, expected:

- `PP`: Papier
- `GL`: Glas
- `GW`: Gewerbeabfall

The existing `categories` config applies across all providers. Unknown categories are
ignored by current sanitization behavior unless added to `CATEGORY_MAP`.

## Fetch Flow

1. Validate config.
2. Load valid cache and send cached dates immediately when available.
3. Fetch BSR dates.
4. If Berlin Recycling is enabled:
   - Try portal fetch when `usePortal` is true and env credentials exist.
   - On portal auth/fetch failure, try public fallback when `usePublicFallback` is true.
   - If credentials are missing, skip portal and use public fallback when enabled.
5. Merge provider results.
6. Deduplicate by `date + category + disposalCompany + provider`.
7. Sort, cache, and send dates to frontend.

## Error Handling

BSR errors keep existing behavior. Berlin Recycling errors are non-fatal when BSR returns
data: log the failure and continue with BSR dates. If Berlin Recycling is enabled and all
enabled Berlin Recycling modes fail, expose a clear error type in logs and tests:
`BR_AUTH_FAILED`, `BR_API_UNREACHABLE`, or `BR_PARSE_ERROR`. The frontend error state is
used only when no usable dates or cache exist.

## Security

Do not store Berlin Recycling credentials in `cache.json`, logs, tests, README examples,
or MagicMirror config examples. Portal session cookies or tokens must stay in memory only.
Tests must use fake credentials and mocked HTTP responses.

## Testing

Add tests before implementation:

- Unit tests for `validateConfig` with `berlinRecycling` defaults.
- Unit tests for added category display values.
- Unit/property tests for merge, dedupe, filtering, and sorting across providers.
- Provider tests with mocked portal login/calendar responses.
- Provider tests with mocked public tenant-search responses.
- Integration tests for BSR + Berlin Recycling merged output.
- Integration tests for portal failure followed by public fallback.
- Integration tests for missing credentials with fallback enabled.
- Integration tests proving Berlin Recycling failure does not hide successful BSR dates.

## Documentation

Update `README.md` with Berlin Recycling setup, environment variables, config options,
new categories, fallback behavior, and privacy notes. Avoid real credentials or private
addresses in examples.
