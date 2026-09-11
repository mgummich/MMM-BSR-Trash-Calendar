# Berlin Recycling

Berlin Recycling is an **optional second provider**. BSR covers the city bins (residual,
organic, recyclables, leaves, Christmas trees); Berlin Recycling covers paper (`PP`),
glass (`GL`), and commercial waste (`GW`) for its own customers.

You only need this page if you have a Berlin Recycling customer portal account.

## Enable it

```javascript
berlinRecycling: {
  enabled: true,
  usePortal: true
}
```

Both flags must be `true`. With `enabled: true, usePortal: false` the provider stays
inactive — there is no unauthenticated data source to fall back to.

## Credentials

The portal requires a login. Credentials come from environment variables, never from
`config.js` (which MagicMirror serves to the browser).

```bash
cd ~/MagicMirror/modules/MMM-BSR-Trash-Calendar
cp .env.example .env
```

```dotenv
BERLIN_RECYCLING_USERNAME=your-login
BERLIN_RECYCLING_PASSWORD=your-password
```

Restart MagicMirror after any `.env` change. `.env` is git-ignored, and credentials are
never written to `cache.json` or to log output.

## Show its categories

Enabling the provider is not enough — its codes must also survive the `categories` filter:

```javascript
categories: ["HM", "BI", "WS", "PP", "GL"];
```

See [Categories](Categories).

## How the provider works

The portal has no public API, so the provider drives the same request chain a browser
would, carrying session cookies from each step into the next:

1. `GET /` — obtain the initial session cookie.
2. `POST /Login.aspx/Auth` — submit the credentials.
3. `GET /Default.aspx` — a redirect back to `Login.aspx` means the login failed.
4. `POST /Default.aspx/GetDashboard` — the portal expects this before any dataset call.
5. `POST /Default.aspx/GetDatasetTableHead` — read the `ABFUHRKALENDER` dataset.

Base URL: `https://kundenportal.berlin-recycling.de/`. Past dates are dropped and the rest
are sorted ascending before they reach the merge step.

Because this is a scraped flow rather than a contract, a portal redesign can break it.
That is by design contained: see the failure behavior below.

## Failure behavior

Berlin Recycling is **optional**, which in this module has a precise meaning:

- A failed Berlin Recycling fetch **never** aborts the fetch cycle.
- It **never** hides BSR dates.
- Its previously cached dates are **kept**, not dropped, so the display degrades to
  slightly stale paper/glass dates instead of to nothing.

Only a BSR failure triggers the retry backoff described in
[API and Cache](API-and-Cache).

Error types you may see in debug logs:

| Error type                   | Meaning                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `BR_AUTH_FAILED`             | Credentials missing, or rejected by the portal.           |
| `BR_PORTAL_RESPONSE_INVALID` | Logged in, but the calendar response could not be parsed. |
| HTTP / timeout errors        | Propagated from the HTTP layer unchanged.                 |

## Things it does _not_ do

- It does not use `addressKey`. The portal account determines the address.
- It does not read `street` / `houseNumber`.
- It does not support multiple accounts; one account per module instance.

Not getting dates? → [Troubleshooting](Troubleshooting).
