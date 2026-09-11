# Security Policy

## Supported versions

This is a MagicMirror² module distributed as a git checkout, not as a published package.
Security fixes land on `main` and are picked up with `git pull`.

| Version        | Supported          |
| -------------- | ------------------ |
| `main`         | :white_check_mark: |
| Latest release | :white_check_mark: |
| Older releases | :x:                |

If you are running an older checkout, update before reporting — the issue may already be
fixed:

```bash
cd ~/MagicMirror/modules/MMM-BSR-Trash-Calendar
git pull && npm install --omit=dev
```

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.**

Report it privately through GitHub Security Advisories:

1. Go to the [Security tab](https://github.com/mgummich/MMM-BSR-TrashCalendar/security).
2. Choose **Report a vulnerability**.

Please include:

- what the issue is and which file or function it affects,
- how to reproduce it, ideally with a minimal configuration,
- the impact you expect (credential exposure, data leak, remote code execution, …),
- the module version or commit, and your Node.js version.

**Redact before sending**: your address, BSR `addressKey`, Berlin Recycling credentials,
session cookies, and the contents of `cache.json` and `.env`. A sanitised reproduction is
more useful than a real one.

### What to expect

This is a volunteer-maintained hobby project, so no response time is guaranteed. In
practice: an acknowledgement within about a week, an assessment of whether the report is
accepted once reproduced, and a fix on `main` plus a GitHub Security Advisory for accepted
reports. Reports that turn out not to be vulnerabilities are closed with an explanation,
and you are welcome to open a normal issue instead. Credit is given in the advisory unless
you prefer otherwise. Please hold off on public disclosure until a fix is available.

## Scope

In scope — this repository's code:

- exposure of Berlin Recycling credentials or session cookies (in logs, `cache.json`, the
  rendered DOM, or socket notifications),
- exposure of address data beyond what the user configured,
- injection through configuration or provider responses (URL, filter, or DOM injection),
- code execution triggered by a malicious or unexpected API response,
- dependency vulnerabilities that this module is actually exposed to.

Out of scope:

- vulnerabilities in MagicMirror² itself, or in the BSR or Berlin Recycling services —
  report those to their maintainers,
- anything requiring the attacker to already have file-system access to the mirror
  (`.env` and `cache.json` are readable by anyone with local access, by design),
- an unpatched dependency advisory with no exploitable path through this module,
- exposure of data on a mirror the user has deliberately made publicly reachable.

## Handling your data

Operators should be aware of what this module stores locally:

| File         | Contains                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `.env`       | Berlin Recycling portal username and password                           |
| `cache.json` | Configured street and house number, resolved BSR address key, and dates |

Both are git-ignored and must stay that way. Credentials are never written to
`cache.json`, never sent to the frontend, and never logged — including with `debug: true`.
Keep the module directory off public shares, and redact addresses, address keys, and
cache contents before posting logs, screenshots, or configuration anywhere.

More detail: [Configuration → Privacy](https://github.com/mgummich/MMM-BSR-TrashCalendar/wiki/Configuration)
on the Wiki.

## Supply chain

Runtime dependencies are kept to a minimum (`dotenv`, `node-fetch`). Dependabot security
updates and secret scanning with push protection are enabled, CodeQL analyses every pull
request, and GitHub Actions are pinned to commit SHAs — a test asserts that pinning.
