# Troubleshooting

## BSR address is not found

Check that `street` and `houseNumber` match a valid Berlin BSR address, including the
spelling and house-number suffix. If you know it, configure the BSR `addressKey`
directly instead. The address key does not apply to Berlin Recycling.

## Dates do not refresh when expected

`updateInterval` is in milliseconds and defaults to `86400000` (24 hours). Use a valid
integer from `60000` through `2147483647`, then restart MagicMirror after changing the
configuration. The module also refreshes when the configured address or enabled-provider
set changes, the cache is missing or unreadable, or it has no future pickup dates.

## Clear stale or private cache data

`cache.json` is stored in the module directory and includes address-related data. Stop
MagicMirror, delete that file, and start MagicMirror to force a fresh BSR fetch:

```bash
pm2 stop MagicMirror
rm ~/MagicMirror/modules/MMM-BSR-Trash-Calendar/cache.json
pm2 start MagicMirror
```

Never commit or share `cache.json` unredacted. If an optional Berlin Recycling fetch
fails, the module intentionally retains that provider's previously cached dates while BSR
dates continue to work.

## Berlin Recycling dates are missing

Confirm all of the following:

- `berlinRecycling.enabled` and `berlinRecycling.usePortal` are both `true`.
- `.env` in the module directory defines `BERLIN_RECYCLING_USERNAME` and
  `BERLIN_RECYCLING_PASSWORD` for an account that can access the customer portal.
- `categories` includes Berlin Recycling codes such as `PP`, `GL`, or `GW`.
- MagicMirror was restarted after editing `.env`.

The Berlin Recycling portal provider is optional, so an unavailable portal does not stop
BSR dates from displaying.

## Collect useful diagnostics

Set `debug: true` in the module configuration, restart MagicMirror, and inspect its logs
for lines beginning `[MMM-BSR-Trash-Calendar]`. Debug logging reports configuration,
cache, API, provider, merge, retry, and scheduling decisions. Redact addresses, address
keys, credentials, cookies, and cache contents before sharing output.
