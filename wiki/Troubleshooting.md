# Troubleshooting

## Quick table

| Symptom                              | Most likely fix                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `Adresse nicht gefunden`             | Street spelling — check it against the BSR site, or configure `addressKey` directly |
| Module stays empty on first start    | Enable `debug: true` and read the log; a retry is already scheduled                 |
| Dates are stale                      | Delete `cache.json` and restart                                                     |
| No Berlin Recycling dates            | Both flags true, `.env` present, BR codes in `categories`, restarted                |
| Too many / too few entries           | Adjust `maxEntries`                                                                 |
| Wrong bins shown                     | Adjust `categories` — it filters all providers at once                              |
| Nothing changes after editing config | Restart MagicMirror; config is read once at startup                                 |

## First step for anything: debug logs

```javascript
config: {
  debug: true;
}
```

Restart MagicMirror and look for lines starting with `[MMM-BSR-Trash-Calendar]`. Debug
logging covers configuration, cache decisions, API calls, provider results, merging,
retries, and scheduling — which is usually enough to tell _which_ of those steps failed.

> Redact addresses, address keys, credentials, cookies, and cache contents before sharing
> any log output.

## BSR address is not found

The BSR address index is picky about spelling and about house-number suffixes.

1. Check `street` and `houseNumber` against the BSR website, including the abbreviation
   style (`"Bergmannstr."`, not `"Bergmannstraße"`).
2. Include the suffix if you have one: `"4a"`, not `"4"`.
3. Still failing? Resolve the key once by hand and configure it directly:

   ```text
   https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet?searchQuery=Bergmannstr.:::12
   ```

   ```javascript
   config: {
     addressKey: "10965_Bergmannstr._12";
   }
   ```

The address key is BSR-only; it has no effect on Berlin Recycling.

## Dates do not refresh when expected

`updateInterval` is in **milliseconds** and defaults to `86400000` (24 hours). Valid range
is `60000` through `2147483647`. Restart after changing it.

Besides the interval, the module also refetches when the address changes, the set of
enabled providers changes, the cache is missing or unreadable, or no future dates remain.
See [API and Cache](API-and-Cache).

If a fetch is failing, the regular interval is suspended while the retry backoff runs
(5 → 10 → 20 → 40 → 80 → 120 minutes). This is expected, and cached dates stay on screen.

## Clear stale or private cache data

```bash
pm2 stop MagicMirror
rm ~/MagicMirror/modules/MMM-BSR-Trash-Calendar/cache.json
pm2 start MagicMirror
```

`cache.json` holds address data — never commit or share it unredacted.

## Berlin Recycling dates are missing

Confirm **all** of these:

- `berlinRecycling.enabled` **and** `berlinRecycling.usePortal` are both `true`.
- `.env` in the module directory sets `BERLIN_RECYCLING_USERNAME` and
  `BERLIN_RECYCLING_PASSWORD` for an account that can log into the customer portal.
- `categories` includes BR codes such as `PP`, `GL`, or `GW` — or is omitted entirely.
- MagicMirror was restarted after editing `.env`.

Then match the debug log against these:

| Log shows                    | Cause                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `BR_AUTH_FAILED`             | Credentials missing or rejected. Verify them by logging into the portal.          |
| `BR_PORTAL_RESPONSE_INVALID` | Login worked, calendar unparsable — likely a portal change. Please open an issue. |
| HTTP / timeout error         | Portal unreachable from the mirror; check network and try again later.            |

An unavailable portal never stops BSR dates from displaying. See
[Berlin Recycling](Berlin-Recycling).

## Nothing renders at all

- Is the directory named exactly `MMM-BSR-Trash-Calendar`? MagicMirror resolves modules by
  directory name, and it differs from the repository name.
- Did `npm install --omit=dev` run **inside** the module directory?
- Is the Node version within `^20.19.0 || >=22.12.0`?
- Is the module entry inside the `modules` array in `config.js`, with a valid `position`?

## Icons are missing or wrong

BSR categories ship bundled SVGs. Berlin Recycling categories fall back to Font Awesome,
which MagicMirror² provides — if those icons are blank, the problem is in the MagicMirror
installation, not this module. See [Categories](Categories).

## Still stuck?

Open an issue at
[mgummich/MMM-BSR-TrashCalendar](https://github.com/mgummich/MMM-BSR-TrashCalendar/issues)
with: what you expected, what happened, your module config **with the address removed**,
your MagicMirror and Node versions, and **redacted** debug log lines.
