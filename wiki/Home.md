<h1 align="center">MMM-BSR-Trash-Calendar Wiki</h1>

<p align="center">
  Complete documentation for the MagicMirror² module that shows upcoming
  Berlin <b>BSR</b> and optional <b>Berlin Recycling</b> pickup dates.
</p>

<p align="center">
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar">Repository</a> ·
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/issues">Issues</a> ·
  <a href="https://github.com/mgummich/MMM-BSR-TrashCalendar/blob/main/README.md">README</a>
</p>

---

## Start here

| I want to…                            | Page                                 |
| ------------------------------------- | ------------------------------------ |
| Install the module                    | [Installation](Installation)         |
| Write my `config.js` entry            | [Configuration](Configuration)       |
| Pick which bins are shown             | [Categories](Categories)             |
| Add paper / glass / commercial dates  | [Berlin Recycling](Berlin-Recycling) |
| Understand fetching, caching, retries | [API and Cache](API-and-Cache)       |
| Fix something that is not working     | [Troubleshooting](Troubleshooting)   |
| Hack on the code                      | [Development](Development)           |
| Cut a release                         | [Releasing](Releasing)               |

## In 60 seconds

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
cd MMM-BSR-Trash-Calendar && npm install --omit=dev
```

```javascript
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  header: "Abfuhrtermine",
  config: { street: "Bergmannstr.", houseNumber: "12" }
}
```

Restart MagicMirror. That is the whole happy path — everything else on this Wiki is
optional detail.

## How it works

```text
config.js ──▶ node_helper ──▶ BSR API              ┐
                │            Berlin Recycling portal ├─▶ merge ─▶ cache.json
                │                                   ┘        │
                └────────────── socket notification ─────────┴─▶ module ─▶ DOM
```

- The **node helper** owns all network access, the cache, and retry scheduling.
- **Providers** (`providers/`) each return raw dates; `merge.js` sorts and de-duplicates.
- The **frontend module** only renders. Category filtering happens on read, so changing
  `categories` takes effect without a refetch.

Details: [API and Cache](API-and-Cache) · [Development](Development).

## Privacy at a glance

`.env` holds portal credentials, `cache.json` holds your address and BSR address key, and
a BSR `addressKey` identifies a specific address. Keep all three out of version control
and redact them in issues, logs, and screenshots.
