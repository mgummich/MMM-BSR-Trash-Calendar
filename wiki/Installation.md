# Installation

Install the module in the `modules` directory of an existing MagicMirror² installation.

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

Add the module configuration to the `modules` array in `~/MagicMirror/config/config.js`.
For an example, see [Configuration](Configuration). Then restart MagicMirror:

```bash
pm2 restart MagicMirror
# or, for a local MagicMirror installation
npm run start
```

Use `npm install` without `--omit=dev` only when developing or running this module's test
suite.
