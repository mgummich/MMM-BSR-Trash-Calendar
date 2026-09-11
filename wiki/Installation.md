# Installation

Install the module in the `modules` directory of an existing MagicMirror² installation.

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

Add the module configuration to the `modules` array in `~/MagicMirror/config/config.js`.
For an example, see [Configuration](Configuration). Then restart MagicMirror. The PM2 command works from any directory:

```bash
pm2 restart MagicMirror
```

For a local MagicMirror installation, first change to the MagicMirror directory and then
run that installation's start command:

```bash
cd ~/MagicMirror
npm run start
```

Use `npm install` without `--omit=dev` only when developing or running this module's test
suite.
