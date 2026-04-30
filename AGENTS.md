# Repository Guidelines

## Project Structure & Module Organization

This is a MagicMirror² module for Berlin BSR/ALBA trash pickup dates. Core runtime
files live at the repository root:

- `MMM-BSR-Trash-Calendar.js`: browser-side MagicMirror module and DOM rendering.
- `node_helper.js`: Node helper for API calls, caching, retry, and socket handling.
- `utils.js`: shared parsing, formatting, filtering, and configuration helpers.
- `MMM-BSR-Trash-Calendar.css`: module styling and category colors.

Tests are grouped under `tests/`: `unit/` for isolated helpers, `integration/` for
socket/concurrency behavior, and `property/` for fast-check property tests.

## Build, Test, and Development Commands

Run `npm install` before development:

- `npm test`: run the complete Vitest suite.
- `npm run test:unit`: run unit tests in `tests/unit`.
- `npm run test:property`: run property-based tests in `tests/property`.
- `npm run test:integration`: run integration tests in `tests/integration`.
- `npm run lint`: check JavaScript with ESLint.
- `npm run format:check`: verify Prettier formatting.
- `npm run format`: format supported files.

For MagicMirror usage, install production dependencies with `npm install --omit=dev`
inside the module directory.

## Coding Style & Naming Conventions

Use CommonJS for MagicMirror runtime files (`require`/`module.exports`) and ECMAScript
2022 syntax where supported. Formatting is defined by `.editorconfig` and `.prettierrc`:
2-space indentation, LF endings, semicolons, double quotes, 100-character print width,
and ES5 trailing commas. ESLint enforces `eqeqeq`, required curly braces, and `no-undef`;
unused variables are warnings. Keep shared logic in `utils.js` when both frontend and
helper behavior need it.

## Testing Guidelines

Vitest is the test runner. Name ordinary tests `*.test.js` and property tests
`*.property.js`; `vitest.config.js` includes only the current test directories. Add or
update tests whenever parsing, cache invalidation, retry timing, socket notifications,
filtering, or display ordering changes. Prefer deterministic fixtures and mocked
network behavior over live BSR API calls.

## Commit & Pull Request Guidelines

Commits use Conventional Commits, enforced by commitlint through Husky. Follow patterns
such as `feat: implement node_helper cache`, `test: add property coverage`, or
`docs: update README`. Before opening a PR, run `npm test`, `npm run lint`, and
`npm run format:check`. PRs should describe the behavior change, list verification,
link issues, and include screenshots for UI or CSS changes.

## Security & Configuration Tips

Do not commit generated `cache.json` files, local MagicMirror configuration, API
responses containing personal addresses, or machine-specific artifacts. The module uses
the public BSR API and should continue to cache responsibly to avoid unnecessary requests.
