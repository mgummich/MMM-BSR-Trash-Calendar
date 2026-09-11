# Configuration

Every option lives in the module's `config` block in `~/MagicMirror/config/config.js`.
The only hard requirement: provide **either** a BSR `addressKey` **or** both `street` and
`houseNumber`.

## Reference

| Option            | Type       | Default                                     | Required | Description                                                                                                                        |
| ----------------- | ---------- | ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `street`          | `string`   | –                                           | Yes¹     | Berlin street name as spelled by BSR, e.g. `"Bergmannstr."`.                                                                       |
| `houseNumber`     | `string`   | –                                           | Yes¹     | House number, e.g. `"12"` or `"4a"`.                                                                                               |
| `addressKey`      | `string`   | –                                           | Yes¹     | BSR address key. When set, address lookup is skipped.                                                                              |
| `dateFormat`      | `string`   | `"dd.MM.yyyy"`                              | No       | Supported tokens: `dd`, `MM`, `yyyy`, `yy`.                                                                                        |
| `maxEntries`      | `number`   | `5`                                         | No       | Maximum number of upcoming dates displayed.                                                                                        |
| `updateInterval`  | `number`   | `86400000`                                  | No       | Refresh interval in milliseconds. Valid range `60000`–`2147483647`. Default 24 h.                                                  |
| `categories`      | `string[]` | `["BI","HM","LT","WS","WB","PP","GL","GW"]` | No       | Categories shown, across all providers. An empty or fully invalid list falls back to all categories. See [Categories](Categories). |
| `debug`           | `boolean`  | `false`                                     | No       | Verbose node-helper logging for config, cache, API, provider, merge, retry, and scheduling decisions.                              |
| `berlinRecycling` | `object`   | `{ enabled: false, usePortal: true }`       | No       | Optional second provider. See [Berlin Recycling](Berlin-Recycling).                                                                |

¹ Provide either `addressKey`, or both `street` and `houseNumber`.

Options are read once at startup — restart MagicMirror after every change.

## Recipes

### Minimal — BSR only

The module resolves the address key from street and house number for you.

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

### Known address key

Skips the lookup request. Useful when the street spelling is ambiguous.

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  config: {
    addressKey: "10965_Bergmannstr._12"
  }
}
```

To find your key, open the lookup URL in a browser:

```text
https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet?searchQuery=Bergmannstr.:::12
```

`addressKey` is BSR-specific. Berlin Recycling ignores it — that provider uses the address
attached to the portal account.

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

`HM`, `BI`, `WS` come from BSR; `PP` and `GL` come from the Berlin Recycling portal.
Credentials go into `.env`, never into `config.js` — see [Berlin Recycling](Berlin-Recycling).

### Everything, annotated

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

## Display behavior

- Dates from all enabled providers are merged and sorted chronologically, then trimmed to
  `maxEntries`.
- Pickups today or tomorrow are highlighted.
- Provider warnings (for example holiday shifts announced by BSR) are shown with the list.
- Each category has a color and icon; BSR fractions use a bundled SVG, others fall back to
  a Font Awesome icon. See [Categories](Categories) for the full list and how to restyle.

## Privacy

Treat these as personal data:

- **`.env`** — Berlin Recycling portal credentials.
- **`cache.json`** — configured street, house number, resolved BSR address key, and dates.
- **`addressKey`** — identifies one specific address.

Keep all three out of version control, and redact them before pasting logs, screenshots,
or configuration into issues.
