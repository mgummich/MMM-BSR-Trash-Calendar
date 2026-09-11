# Installation

## Requirements

| Requirement  | Version / note                                                                 |
| ------------ | ------------------------------------------------------------------------------ |
| MagicMirror² | Any release with module support                                                |
| Node.js      | `^20.19.0 \|\| >=22.12.0` (matches MagicMirror² itself)                        |
| Network      | Outbound HTTPS to `umapi.bsr.de` (and the Berlin Recycling portal, if enabled) |
| BSR API key  | None — the BSR endpoints are public                                            |

## Install

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

The directory name **must** be `MMM-BSR-Trash-Calendar` — MagicMirror² resolves modules by
directory name, and the repository name differs from it.

Use plain `npm install` (without `--omit=dev`) only when you intend to run lint, format,
or the test suite. See [Development](Development).

## Configure

Add an entry to the `modules` array in `~/MagicMirror/config/config.js`:

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

Full option list and more recipes: [Configuration](Configuration).

## Restart MagicMirror

```bash
pm2 restart MagicMirror
```

The PM2 command works from any directory. For a local (non-PM2) installation:

```bash
cd ~/MagicMirror
npm run start
```

## Verify

1. The module renders a header and a list of upcoming dates within a few seconds.
2. If it stays empty, set `debug: true`, restart, and look for `[MMM-BSR-Trash-Calendar]`
   lines in the MagicMirror log.
3. A `cache.json` file appears in the module directory after the first successful fetch.

## Update

```bash
cd ~/MagicMirror/modules/MMM-BSR-Trash-Calendar
git pull
npm install --omit=dev
pm2 restart MagicMirror
```

Your `config.js` and `.env` are untouched by `git pull`. If a release changes the cache
format, the old cache is read and upgraded automatically on the next successful fetch —
no manual step needed.

## Uninstall

```bash
pm2 stop MagicMirror
rm -rf ~/MagicMirror/modules/MMM-BSR-Trash-Calendar
```

Then remove the module entry from `config.js` and start MagicMirror again. Deleting the
directory also removes `cache.json` and `.env`, which hold address and credential data.
