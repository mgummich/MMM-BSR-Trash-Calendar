# Development

For contributors and maintainers. Users do not need anything on this page.

## Setup

```bash
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git
cd MMM-BSR-TrashCalendar
npm install          # with dev dependencies
```

Requires Node `^20.19.0 || >=22.12.0`. `npm install` also installs Husky hooks
(commitlint on commit, lint-staged on staged files).

## Commands

| Command                    | What it does                       |
| -------------------------- | ---------------------------------- |
| `npm test`                 | Full Vitest suite                  |
| `npm run test:unit`        | `tests/unit` only                  |
| `npm run test:property`    | `tests/property` only (fast-check) |
| `npm run test:integration` | `tests/integration` only           |
| `npm run lint`             | ESLint                             |
| `npm run lint:fix`         | ESLint with autofix                |
| `npm run format`           | Prettier write                     |
| `npm run format:check`     | Prettier check (what CI runs)      |

Before opening a PR: `npm test && npm run lint && npm run format:check`.

## Layout

```text
MMM-BSR-Trash-Calendar.js            frontend module — rendering, DOM, socket receive
MMM-BSR-Trash-Calendar.css           styling, `.bsr-*` classes
node_helper.js                       fetch cycle, cache, retry, socket notifications
utils.js                             CATEGORY_INFO, dates, cache keys, filtering, backoff
providers/bsr.js                     BSR address lookup + pickup dates
providers/berlinRecyclingPortal.js   portal login chain + calendar fetch
providers/berlinRecyclingParse.js    pure parsing helpers
providers/merge.js                   merge, filter and sort provider dates
icons/                               bundled SVGs for BSR categories
tests/unit | property | integration  test suites
wiki/                                source of this Wiki (see Releasing)
```

## Architecture notes

- **The helper owns all I/O.** The frontend module never fetches; it receives merged data
  over a socket notification and renders it.
- **Providers are dumb.** Each returns raw dates for its source. Ordering, de-duplication,
  and filtering live in `merge.js` and `utils.js`, not in providers.
- **`required` vs optional providers.** BSR is required — its failure fails the cycle and
  starts the backoff. Berlin Recycling is optional — its failure is contained and its
  cached dates are retained.
- **Filter on read, not on write.** The cache stores unfiltered provider dates so a
  `categories` change needs no refetch. Keep it that way.
- **HTTP is injected.** Providers take an `executeApiCall` function, which is what makes
  them testable without network access.
- **Shared logic goes in `utils.js`** when both the frontend and the helper need it.

## Testing

Vitest. Naming: ordinary tests `*.test.js`, property tests `*.property.js`.

Prefer deterministic fixtures and mocked HTTP over live calls. Add or update tests
whenever parsing, cache invalidation, retry timing, socket notifications, filtering, or
display ordering changes.

Live BSR API tests are skipped by default:

```bash
BSR_LIVE_TESTS=true npx vitest run tests/integration/bsr-api.test.js
```

`tests/unit/workflow-action-pins.test.js` asserts that GitHub Actions are pinned to commit
SHAs — keep new workflow steps pinned.

## Style

Defined by `.editorconfig`, `.prettierrc`, and `eslint.config.mjs`:

- CommonJS (`require` / `module.exports`) for MagicMirror runtime files, ES2022 syntax.
- 2-space indent, LF, semicolons, double quotes, 100-column print width, ES5 trailing commas.
- ESLint enforces `eqeqeq`, curly braces, and `no-undef`; unused variables are warnings.

## Commits and pull requests

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint via
Husky — e.g. `feat: add Laubtonne icon`, `fix: encode address key filters`,
`docs: update wiki`.

A pull request should describe the behavior change, list the verification you ran, link
the issue, and include a screenshot for any UI or CSS change.

## Security

Never commit `cache.json`, `.env`, local MagicMirror configuration, or API responses
containing real addresses. Report vulnerabilities per
[SECURITY.md](https://github.com/mgummich/MMM-BSR-TrashCalendar/blob/main/SECURITY.md)
rather than in a public issue.

## Documentation

The README is the gateway: what the module is, a quick start, and links here. Everything
else — full option reference, provider details, internals, troubleshooting — belongs on
this Wiki, edited as Markdown under `wiki/` on `main`. See [Releasing](Releasing) for how
the sync works.
