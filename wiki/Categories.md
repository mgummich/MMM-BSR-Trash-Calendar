# Categories

A category (BSR calls it a _fraction_) is one kind of waste. The `categories` option is a
single allow-list applied to **every** provider.

## Supported codes

| Code | German name    | What it is          | Provider         | Icon             | Color     | Bundled SVG |
| ---- | -------------- | ------------------- | ---------------- | ---------------- | --------- | ----------- |
| `BI` | Biogut         | Organic waste       | BSR              | `fa-seedling`    | `#8B4513` | ✅ `BI.svg` |
| `HM` | Hausmüll       | Residual waste      | BSR              | `fa-trash`       | `#808080` | ✅ `HM.svg` |
| `LT` | Laubtonne      | Seasonal leaf bin   | BSR              | `fa-leaf`        | `#228B22` | ✅ `LT.svg` |
| `WS` | Wertstoffe     | Recyclables         | BSR              | `fa-recycle`     | `#FFD700` | ✅ `WS.svg` |
| `WB` | Weihnachtsbaum | Christmas trees     | BSR              | `fa-tree`        | `#006400` | ✅ `WB.svg` |
| `PP` | Papier         | Paper and cardboard | Berlin Recycling | `fa-newspaper`   | `#1E88E5` | –           |
| `GL` | Glas           | Glass               | Berlin Recycling | `fa-wine-bottle` | `#43A047` | –           |
| `GW` | Gewerbeabfall  | Commercial waste    | Berlin Recycling | `fa-dumpster`    | `#6D4C41` | –           |

Categories without a bundled SVG render their Font Awesome icon instead.

## Filtering

```javascript
categories: ["HM", "BI", "WS"]; // BSR only
categories: ["HM", "BI", "PP", "GL"]; // BSR household + BR paper and glass
categories: ["PP"]; // Berlin Recycling paper only
```

Rules worth knowing:

- **Filtering happens on read, not on fetch.** The cache stores raw, unfiltered provider
  dates, so changing `categories` takes effect on the next render — no refetch, no API
  call, no cache deletion.
- **An empty or fully invalid list falls back to all categories**, so a typo degrades to
  "show everything" rather than to a blank module.
- Listing a Berlin Recycling code does **not** enable that provider. You still need
  `berlinRecycling.enabled: true` — see [Berlin Recycling](Berlin-Recycling).
- Listing a code a provider never returns is harmless; it simply matches nothing.

## Restyling

The name, color, icon, and SVG of every category are defined in one map,
`CATEGORY_INFO` in `utils.js`. The color is applied as an inline style on the icon
element, so a stylesheet override needs `!important`:

```css
/* MagicMirror custom.css */
.bsr-category-icon {
  color: #ffffff !important;
}
```

Layout and typography use the `.bsr-*` classes in `MMM-BSR-Trash-Calendar.css`
(`.bsr-entry`, `.bsr-entry.today`, `.bsr-category-name`, `.bsr-date`, `.bsr-warning`, …)
and can be overridden without `!important`. To change a single category's color or icon,
edit its entry in `CATEGORY_INFO`.
