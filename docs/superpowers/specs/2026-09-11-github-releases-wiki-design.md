# GitHub Releases and Wiki Design

## Goal

Give `MMM-BSR-Trash-Calendar` a predictable public release process, useful release notes,
and GitHub Wiki documentation that is authored and reviewed with the module source.

## Scope

- Create a GitHub Release automatically when a maintainer pushes a version tag matching
  `vX.Y.Z`.
- Use GitHub-generated release notes, which group merged pull requests and list new
  contributors without maintaining a second hand-written changelog.
- Reject a release when the tag version does not match `package.json`.
- Maintain Wiki pages as Markdown under `wiki/` in the main repository.
- Publish those pages to the repository's GitHub Wiki from `main` through a dedicated,
  least-privilege workflow.
- Document the maintainer release steps and the Wiki synchronization behavior.

Out of scope: package publication, release artifacts, automatic semantic version bumps,
and replacing the existing README as the module's quick-start document.

## Architecture

### Release workflow

`.github/workflows/release.yml` runs on pushed tags matching `v*`. It performs a shallow
checkout, installs the Node version declared by the project, and compares the tag with
the `version` field from `package.json`. If they differ, the workflow fails before any
GitHub Release is created. If they match, the workflow creates a release using the
official GitHub CLI/action capability with GitHub-generated release notes enabled.

The release job has `contents: write`; no other GitHub permissions are granted. Actions
remain pinned to full commit SHAs, matching the repository's existing supply-chain policy.

### Wiki workflow

`.github/workflows/wiki.yml` runs after a push to `main` that changes files under
`wiki/**`, and can also be dispatched manually. It checks out the source repository and
the `<owner>/<repository>.wiki.git` repository, copies the tracked Markdown pages into
the Wiki worktree, commits only when content changed, and pushes the Wiki commit.

The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`. GitHub Wiki must be
enabled in repository settings before the first successful sync; that provisioning step
is deliberately outside automation because it changes repository settings.

### Documentation source

`wiki/` contains focused pages, with `Home.md` as Wiki landing page:

- `Home.md`: module purpose and navigation.
- `Installation.md`: MagicMirror installation and production dependency setup.
- `Configuration.md`: supported configuration, categories, and privacy guidance.
- `Troubleshooting.md`: common API, cache, and update-interval issues.
- `Releasing.md`: tag format, version alignment, release notes, and Wiki sync procedure.

`README.md` links readers to the Wiki for extended documentation and retains the concise
in-repository introduction.

## Data flow

```text
Maintainer updates package.json version
  -> pushes vX.Y.Z tag
  -> release workflow validates tag
  -> GitHub creates release with generated notes

Maintainer changes wiki/*.md on main
  -> Wiki workflow clones .wiki.git
  -> copies Markdown
  -> commits and pushes only a real content change
```

## Failure handling

- A malformed or mismatched release tag fails visibly and creates no release.
- A Wiki workflow failure leaves source Markdown intact; rerunning the workflow is safe.
- If the Wiki is disabled or unavailable, the workflow reports the Git failure with an
  actionable message; it never silently drops documentation.
- Empty Wiki changes result in no commit, preventing noisy history.

## Testing and verification

- Add unit tests that inspect workflow YAML for tag trigger, least-privilege permissions,
  package-version validation, generated notes, Wiki path trigger, and pinned actions.
- Run the complete existing test suite, lint, and formatting check.
- The first live release and Wiki synchronization should be observed in GitHub Actions;
  local tests cannot create a real release or write to the remote Wiki.

## Security

Workflows must not expose private addresses, cache files, configuration files, or secrets.
The Wiki receives only committed public Markdown. The built-in workflow token replaces
any personal access token.
