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

<p align="center">
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki"><b>Documentation Wiki</b></a> ·
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Installation">Install</a> ·
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Configuration">Configure</a> ·
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Troubleshooting">Troubleshoot</a> ·
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/issues">Issues</a>
</p>

---

## What it does

|                         |                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 📍 **Address lookup**   | Resolves a Berlin street + house number to the BSR address key, or takes an `addressKey` directly.       |
| 🗓️ **Merged calendar**  | BSR categories plus optional Berlin Recycling paper, glass and commercial dates, in chronological order. |
| 🎨 **Category styling** | Per-category color, Font Awesome icon and bundled SVG for the BSR fractions.                             |
| 🔎 **One filter list**  | A single `categories` list filters every provider; changes apply instantly, without a refetch.           |
| ⏰ **Today / tomorrow** | Imminent pickups are highlighted, provider warnings (e.g. holiday shifts) are shown.                     |
| 💾 **Durable cache**    | `cache.json` survives restarts and cuts API calls; a failing optional provider keeps its cached dates.   |
| 🔁 **Backoff retries**  | API failures retry after 5, 10, 20, 40, 80, 120 minutes.                                                 |

No API key required. BSR data is public.

## Quick start

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

Add to the `modules` array in `~/MagicMirror/config/config.js`:

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

Restart MagicMirror (`pm2 restart MagicMirror`). Done — that is the whole happy path.

> The module directory must be named `MMM-BSR-Trash-Calendar`; it differs from the
> repository name.

Details and every option: **[Installation](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Installation)**
· **[Configuration](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Configuration)**

## Documentation

Everything beyond the quick start lives in the
[Wiki](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki).

| Page                                                                                        | Covers                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [Installation](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Installation)         | Requirements, install, verify, update, uninstall          |
| [Configuration](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Configuration)       | Full option reference, recipes, display behavior, privacy |
| [Categories](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Categories)             | All category codes, filtering rules, restyling            |
| [Berlin Recycling](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Berlin-Recycling) | Optional provider, credentials, failure behavior          |
| [API and Cache](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/API-and-Cache)       | Endpoints, cache format, invalidation, retry backoff      |
| [Troubleshooting](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Troubleshooting)   | Symptom-by-symptom fixes, debug logging                   |
| [Development](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Development)           | Architecture, commands, tests, style, contributing        |
| [Releasing](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Releasing)               | Tagging, release workflow, Wiki sync                      |

Wiki pages are edited as Markdown in [`wiki/`](wiki) on `main` and synced automatically.

## Privacy

`.env` holds Berlin Recycling credentials and `cache.json` holds your address and BSR
address key. Both are git-ignored — keep them that way, and redact addresses, address
keys, and logs before posting them in issues.

## Contributing

```bash
npm install
npm test && npm run lint && npm run format:check
```

Conventional Commits, enforced by commitlint. Full guide:
[Development](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Development).
Vulnerabilities: see [SECURITY.md](SECURITY.md).

## License

MIT
