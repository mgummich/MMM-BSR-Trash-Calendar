# GitHub Releases and Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate GitHub releases from matching version tags and publish tracked Markdown documentation to the GitHub Wiki.

**Architecture:** A release workflow validates a pushed `vX.Y.Z` tag against `package.json` before creating a GitHub Release with generated notes. Wiki pages live in `wiki/` beside the source and a workflow mirrors them to the repository Wiki only after they merge to `main`.

**Tech Stack:** GitHub Actions, GitHub CLI, Bash, Markdown, Vitest, Node.js 20/22.

---

## File structure

- Modify: `tests/unit/workflow-action-pins.test.js` — add workflow contract assertions.
- Create: `.github/workflows/release.yml` — tag release creation.
- Create: `.github/workflows/wiki.yml` — source-controlled Wiki synchronization.
- Create: `wiki/Home.md`, `wiki/Installation.md`, `wiki/Configuration.md`, `wiki/Troubleshooting.md`, `wiki/Releasing.md` — Wiki source pages.
- Modify: `README.md` — link to the Wiki.

### Task 1: Specify release and Wiki workflow contracts

**Files:**

- Modify: `tests/unit/workflow-action-pins.test.js`
- Test: `tests/unit/workflow-action-pins.test.js`

- [ ] **Step 1: Write failing workflow-contract tests**

Append:

```js
describe("release and wiki workflows", () => {
  const readWorkflow = (name) => readFileSync(join(workflowsDir, name), "utf8");

  it("creates generated GitHub release notes only for version tags", () => {
    const workflow = readWorkflow("release.yml");
    expect(workflow).toMatch(/push:\s*\n\s*tags:\s*\n\s*- "v\*"/);
    expect(workflow).toMatch(/contents: write/);
    expect(workflow).toMatch(/TAG_VERSION="\$\{GITHUB_REF_NAME#v\}"/);
    expect(workflow).toMatch(
      /PACKAGE_VERSION="\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/
    );
    expect(workflow).toMatch(/if \[ "\$TAG_VERSION" != "\$PACKAGE_VERSION" \]/);
    expect(workflow).toMatch(/gh release create "\$GITHUB_REF_NAME" --generate-notes/);
  });

  it("synchronizes tracked Wiki pages from main without empty commits", () => {
    const workflow = readWorkflow("wiki.yml");
    expect(workflow).toMatch(/paths:\s*\n\s*- "wiki\/\*\*"/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/contents: write/);
    expect(workflow).toMatch(/\$\{GITHUB_REPOSITORY\}\.wiki\.git/);
    expect(workflow).toMatch(/git diff --quiet/);
    expect(workflow).toMatch(/git commit -m "docs: sync GitHub Wiki"/);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:unit -- tests/unit/workflow-action-pins.test.js`

Expected: FAIL because `release.yml` and `wiki.yml` do not exist.

- [ ] **Step 3: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - name: Verify tag matches package version
        run: |
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          PACKAGE_VERSION="$(node -p "require('./package.json').version")"
          if [ "$TAG_VERSION" != "$PACKAGE_VERSION" ]; then
            echo "Tag $GITHUB_REF_NAME does not match package version $PACKAGE_VERSION."
            exit 1
          fi
      - name: Create GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" --generate-notes --title "$GITHUB_REF_NAME"
```

- [ ] **Step 4: Create `.github/workflows/wiki.yml`**

```yaml
name: Sync GitHub Wiki

on:
  push:
    branches:
      - main
    paths:
      - "wiki/**"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source documentation
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - name: Clone and update GitHub Wiki
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: |
          git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.wiki.git" wiki-remote
          rm -f wiki-remote/*.md
          cp wiki/*.md wiki-remote/
          cd wiki-remote
          if git diff --quiet; then
            echo "Wiki is already current."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add --all
          git commit -m "docs: sync GitHub Wiki"
          git push
```

- [ ] **Step 5: Run the targeted test and confirm GREEN**

Run: `npm run test:unit -- tests/unit/workflow-action-pins.test.js`

Expected: PASS with action pins and release/Wiki contracts green.

- [ ] **Step 6: Commit**

Run: `git add .github/workflows/release.yml .github/workflows/wiki.yml tests/unit/workflow-action-pins.test.js && git commit -m "ci: automate GitHub releases and wiki sync"`

### Task 2: Add Wiki content and link it from the README

**Files:**

- Create: `wiki/Home.md`, `wiki/Installation.md`, `wiki/Configuration.md`, `wiki/Troubleshooting.md`, `wiki/Releasing.md`
- Modify: `README.md`

- [ ] **Step 1: Create `wiki/Home.md`**

```md
# MMM-BSR-Trash-Calendar

`MMM-BSR-Trash-Calendar` displays upcoming Berlin BSR and optional Berlin Recycling collection dates on MagicMirror².

## Documentation

- [Installation](Installation)
- [Configuration](Configuration)
- [Troubleshooting](Troubleshooting)
- [Releasing](Releasing)
```

- [ ] **Step 2: Create `wiki/Installation.md`**

````md
# Installation

```sh
cd ~/MagicMirror/modules
git clone https://github.com/mgummich/MMM-BSR-TrashCalendar.git MMM-BSR-Trash-Calendar
cd MMM-BSR-Trash-Calendar
npm install --omit=dev
```

Add the module configuration shown on the [Configuration](Configuration) page to `~/MagicMirror/config/config.js`, then restart MagicMirror.
````

- [ ] **Step 3: Create `wiki/Configuration.md`**

````md
# Configuration

Provide either `addressKey`, or both `street` and `houseNumber`:

```js
{
  module: "MMM-BSR-Trash-Calendar",
  position: "top_right",
  config: { street: "Bergmannstr.", houseNumber: "12", categories: ["BI", "HM", "LT", "WS", "WB"] }
}
```

Set `berlinRecycling.enabled` and `berlinRecycling.usePortal` to `true` to include portal dates. Put `BERLIN_RECYCLING_USERNAME` and `BERLIN_RECYCLING_PASSWORD` in `.env`; never commit `.env`, `cache.json`, or a real address key. The README has the full option and category reference.
````

- [ ] **Step 4: Create `wiki/Troubleshooting.md` and `wiki/Releasing.md`**

Create `wiki/Troubleshooting.md`:

```md
# Troubleshooting

- Confirm that the configured BSR street, house number, or address key is valid.
- Restart MagicMirror after configuration changes, or wait for the configured `updateInterval`.
- Delete local `cache.json` only to force a fresh fetch. It can contain address-derived data and must never be committed.
- For Berlin Recycling, confirm both portal environment variables are available to the MagicMirror process. A portal failure does not remove successful BSR dates.
- Set `debug: true` temporarily for detailed helper logs, then disable it after diagnosis.
```

Create `wiki/Releasing.md`:

````md
# Releasing

1. Update `package.json` and `package-lock.json`.
2. Run `npm test`, `npm run lint`, and `npm run format:check`.
3. Merge the version change to `main`.
4. Create and push an annotated tag that exactly matches the package version:

   ```sh
   git tag -a v1.2.3 -m "v1.2.3"
   git push github v1.2.3
   ```

5. Confirm the Release workflow created a GitHub Release with generated notes.

Wiki pages are authored in the repository's `wiki/` directory. Changes merged to `main` sync automatically. Use the **Sync GitHub Wiki** workflow's manual dispatch to retry a failed synchronization. Enable the repository Wiki in GitHub settings before the first synchronization.
````

- [ ] **Step 5: Add the Wiki link to `README.md`**

Add `- [Wiki](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki)` to Contents. After the badge paragraph, add:

```md
> For installation, configuration, troubleshooting, and maintainer guidance in a browsable format, see the [GitHub Wiki](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki).
```

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run lint && npm run format:check`

Expected: all Vitest suites, ESLint, and Prettier checks pass.

Run: `git add README.md wiki && git commit -m "docs: add GitHub Wiki content"`

## Final verification

- [ ] Run `git diff --check`; expected output is empty.
- [ ] Confirm the GitHub repository has **Wikis** enabled before the first sync.
- [ ] On the next matching version tag, confirm GitHub creates a release with generated notes.
