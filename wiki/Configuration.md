# Configuration

Provide either a BSR `addressKey` or both `street` and `houseNumber`. With a street and
house number, the module resolves the BSR address key automatically.

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

The `categories` list filters dates from every enabled provider. In the example, `HM`,
`BI`, and `WS` are BSR categories; `PP` and `GL` are Berlin Recycling paper and glass.
Other supported category codes are `LT` (Laubtonne), `WB` (Weihnachtsbaum), and `GW`
(Gewerbeabfall).

## BSR address settings

An `addressKey` is BSR-specific and can replace `street` and `houseNumber` when it is
already known:

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  config: {
    addressKey: "10965_Bergmannstr._12"
  }
}
```

Do not expect this key to configure Berlin Recycling; that provider uses the address in
the authenticated customer portal account.

## Berlin Recycling portal

Berlin Recycling is optional and works only when both `enabled` and `usePortal` are
`true`. Its credentials belong in a `.env` file in the module directory, never in
`config.js`:

```bash
cp .env.example .env
```

```dotenv
BERLIN_RECYCLING_USERNAME=your-login
BERLIN_RECYCLING_PASSWORD=your-password
```

Restart MagicMirror after changing `.env`.

## Privacy

Treat the following as private address or account data:

- `.env` contains Berlin Recycling portal credentials.
- `cache.json` contains the configured street, house number, resolved BSR address key,
  and pickup-date data.
- A BSR `addressKey` identifies a configured address and should not be posted in issues,
  screenshots, or public configuration examples.

Keep `.env`, `cache.json`, and local MagicMirror configuration out of version control and
redact them before sharing logs or support requests.
