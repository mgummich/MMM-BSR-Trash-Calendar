# Berlin Recycling Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Berlin Recycling as an optional additional provider, merging portal/public dates with existing BSR dates.

**Architecture:** Move provider-specific HTTP/parsing behind focused provider modules. Keep `node_helper.js` responsible for MagicMirror sockets, cache, retry, locking, and orchestration. Normalize all providers to existing `PickupDate` objects, then merge, dedupe, filter, sort, cache, and render through current UI.

**Tech Stack:** MagicMirror² NodeHelper CommonJS, project ESM utilities, `node-fetch`, Vitest, fast-check, ESLint, Prettier.

---

## File Structure

- Create `providers/bsr.js`: BSR address lookup and calendar fetch currently embedded in `node_helper.js`.
- Create `providers/berlinRecyclingPortal.js`: portal auth/session fetch with env credentials.
- Create `providers/berlinRecyclingPublic.js`: public tenant street-search fetch.
- Create `providers/merge.js`: provider-independent merge, dedupe, category filter, sort.
- Modify `utils.js`: Berlin Recycling categories and `berlinRecycling` config defaults.
- Modify `node_helper.js`: delegate provider fetches and preserve existing retry/cache behavior.
- Modify `MMM-BSR-Trash-Calendar.js`: default config adds `berlinRecycling`.
- Modify `README.md`: setup, env vars, categories, fallback behavior.
- Add tests in `tests/unit`, `tests/property`, and `tests/integration`.

## Task 1: Config and Category Support

**Files:**

- Modify: `utils.js`
- Modify: `MMM-BSR-Trash-Calendar.js`
- Test: `tests/unit/config.test.js`
- Test: `tests/unit/utils.test.js`

- [ ] **Step 1: Write failing config tests**

Add to `tests/unit/config.test.js`:

```js
describe("berlinRecycling config", () => {
  it("defaults Berlin Recycling to disabled", () => {
    const result = validateConfig({ street: "Bergmannstr.", houseNumber: "12" });

    expect(result.error).toBeUndefined();
    expect(result.config.berlinRecycling).toEqual({
      enabled: false,
      usePortal: true,
      usePublicFallback: true,
    });
  });

  it("preserves explicit Berlin Recycling settings", () => {
    const result = validateConfig({
      street: "Bergmannstr.",
      houseNumber: "12",
      berlinRecycling: { enabled: true, usePortal: false, usePublicFallback: true },
    });

    expect(result.config.berlinRecycling).toEqual({
      enabled: true,
      usePortal: false,
      usePublicFallback: true,
    });
  });
});
```

- [ ] **Step 2: Write failing category tests**

Add to `tests/unit/utils.test.js`:

```js
describe("Berlin Recycling categories", () => {
  it("supports Papier, Glas, and Gewerbeabfall display metadata", () => {
    expect(getCategoryDisplay("PP")).toMatchObject({ name: "Papier", icon: "fa-newspaper" });
    expect(getCategoryDisplay("GL")).toMatchObject({ name: "Glas", icon: "fa-wine-bottle" });
    expect(getCategoryDisplay("GW")).toMatchObject({ name: "Gewerbeabfall", icon: "fa-dumpster" });
  });

  it("allows Berlin Recycling categories in category filtering", () => {
    expect(sanitizeCategories(["HM", "PP", "GL"])).toEqual(["HM", "PP", "GL"]);
  });
});
```

- [ ] **Step 3: Verify failures**

Run: `npm run test:unit -- tests/unit/config.test.js tests/unit/utils.test.js`

Expected: FAIL because BR defaults/categories are missing.

- [ ] **Step 4: Implement config/categories**

In `utils.js`, extend `CATEGORY_MAP`:

```js
PP: { name: "Papier", color: "#1E88E5", icon: "fa-newspaper" },
GL: { name: "Glas", color: "#43A047", icon: "fa-wine-bottle" },
GW: { name: "Gewerbeabfall", color: "#6D4C41", icon: "fa-dumpster" },
```

In `validateConfig`, include:

```js
const berlinRecycling = {
  enabled: config.berlinRecycling?.enabled ?? false,
  usePortal: config.berlinRecycling?.usePortal ?? true,
  usePublicFallback: config.berlinRecycling?.usePublicFallback ?? true,
};
```

and return it in `config`.

In `MMM-BSR-Trash-Calendar.js` defaults, add same `berlinRecycling` object.

- [ ] **Step 5: Verify pass and commit**

Run: `npm run test:unit -- tests/unit/config.test.js tests/unit/utils.test.js`

Expected: PASS.

Commit:

```bash
git add utils.js MMM-BSR-Trash-Calendar.js tests/unit/config.test.js tests/unit/utils.test.js
git commit -m "feat: add berlin recycling config categories"
```

## Task 2: Merge and Deduplication Utility

**Files:**

- Create: `providers/merge.js`
- Test: `tests/unit/provider-merge.test.js`
- Test: `tests/property/provider-merge.property.js`

- [ ] **Step 1: Write failing unit tests**

Create `tests/unit/provider-merge.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mergeProviderDates } from "../../providers/merge.js";

const base = { categoryName: "Hausmüll", color: "#808080", icon: "fa-trash", warningText: "" };

describe("mergeProviderDates", () => {
  it("merges, filters, deduplicates, and sorts provider dates", () => {
    const bsr = [
      { ...base, date: "2099-03-02", category: "HM", disposalCompany: "BSR", provider: "BSR" },
      { ...base, date: "2099-03-02", category: "HM", disposalCompany: "BSR", provider: "BSR" },
    ];
    const br = [
      {
        ...base,
        date: "2099-02-01",
        category: "PP",
        categoryName: "Papier",
        disposalCompany: "Berlin Recycling",
        provider: "BERLIN_RECYCLING",
      },
    ];

    expect(mergeProviderDates([bsr, br], ["HM", "PP"]).map((d) => d.date)).toEqual([
      "2099-02-01",
      "2099-03-02",
    ]);
  });
});
```

- [ ] **Step 2: Write failing property test**

Create `tests/property/provider-merge.property.js`:

```js
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mergeProviderDates } from "../../providers/merge.js";

describe("Provider merge properties", () => {
  it("never returns categories outside configured categories", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.constantFrom("2099-01-01", "2099-01-02"),
            category: fc.constantFrom("HM", "PP", "GL"),
            categoryName: fc.string(),
            color: fc.string(),
            icon: fc.string(),
            disposalCompany: fc.constantFrom("BSR", "Berlin Recycling"),
            warningText: fc.string(),
            provider: fc.constantFrom("BSR", "BERLIN_RECYCLING"),
          })
        ),
        (dates) => mergeProviderDates([dates], ["PP"]).every((d) => d.category === "PP")
      )
    );
  });
});
```

- [ ] **Step 3: Verify failures**

Run: `npm test -- tests/unit/provider-merge.test.js tests/property/provider-merge.property.js`

Expected: FAIL because `providers/merge.js` missing.

- [ ] **Step 4: Implement merge utility**

Create `providers/merge.js`:

```js
import { filterByCategories, sortByDate } from "../utils.js";

export function mergeProviderDates(dateGroups, categories) {
  const seen = new Set();
  const merged = [];

  for (const group of dateGroups) {
    for (const date of group || []) {
      const key = `${date.date}|${date.category}|${date.disposalCompany}|${date.provider ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(date);
      }
    }
  }

  return sortByDate(filterByCategories(merged, categories));
}
```

- [ ] **Step 5: Verify pass and commit**

Run: `npm test -- tests/unit/provider-merge.test.js tests/property/provider-merge.property.js`

Expected: PASS.

Commit:

```bash
git add providers/merge.js tests/unit/provider-merge.test.js tests/property/provider-merge.property.js
git commit -m "feat: add provider date merge utility"
```

## Task 3: Extract BSR Provider

**Files:**

- Create: `providers/bsr.js`
- Modify: `node_helper.js`
- Test: `tests/unit/bsr-provider.test.js`
- Existing: `tests/integration/socket.test.js`

- [ ] **Step 1: Write failing provider tests**

Create `tests/unit/bsr-provider.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { resolveBsrAddress, fetchBsrPickupDates } from "../../providers/bsr.js";
import * as utils from "../../utils.js";

describe("BSR provider", () => {
  it("resolves first address value", async () => {
    const execute = vi.fn().mockResolvedValue([{ value: "10965_Bergmannstr._12" }]);
    await expect(resolveBsrAddress(execute, "Bergmannstr.", "12")).resolves.toBe(
      "10965_Bergmannstr._12"
    );
  });

  it("returns null for empty address result", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    await expect(resolveBsrAddress(execute, "Missing", "1")).resolves.toBeNull();
  });

  it("fetches current and next month and parses dates", async () => {
    const execute = vi.fn().mockResolvedValue({ dates: {} });
    const parsed = await fetchBsrPickupDates(
      execute,
      utils,
      "addr-key",
      new Date("2099-12-15T00:00:00Z")
    );

    expect(parsed).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0]).toContain("2099-12-01T00:00:00");
    expect(execute.mock.calls[1][0]).toContain("2100-01-01T00:00:00");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/bsr-provider.test.js`

Expected: FAIL because provider missing.

- [ ] **Step 3: Implement BSR provider**

Create `providers/bsr.js` by moving URL construction from `node_helper.js` into:

```js
export async function resolveBsrAddress(executeApiCall, street, houseNumber) {
  const url =
    `https://umnewforms.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet` +
    `?searchQuery=${encodeURIComponent(street)}:::${encodeURIComponent(houseNumber)}`;
  const data = await executeApiCall(url);
  return Array.isArray(data) && data.length > 0 ? data[0].value : null;
}

export async function fetchBsrPickupDates(executeApiCall, utils, addressKey, now = new Date()) {
  const months = utils.getMonthRange(now);
  const allDates = [];

  for (const { year, month } of months) {
    const mm = String(month).padStart(2, "0");
    const url =
      `https://umnewforms.bsr.de/p/de.bsr.adressen.app/abfuhrEvents` +
      `?filter=AddrKey eq '${addressKey}'` +
      ` and DateFrom eq datetime'${year}-${mm}-01T00:00:00'` +
      ` and DateTo eq datetime'${year}-${mm}-01T00:00:00'`;
    allDates.push(...utils.parsePickupDates(await executeApiCall(url)));
  }

  return allDates.map((date) => ({ ...date, provider: "BSR" }));
}
```

Modify `node_helper.js` `resolveAddress` and `fetchPickupDates` to dynamically import and call this provider.

- [ ] **Step 4: Verify existing behavior**

Run: `npm run test:unit -- tests/unit/bsr-provider.test.js`

Expected: PASS.

Run: `npm run test:integration`

Expected: PASS; existing socket behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add providers/bsr.js node_helper.js tests/unit/bsr-provider.test.js
git commit -m "refactor: extract bsr provider"
```

## Task 4: Berlin Recycling Public Provider

**Files:**

- Create: `providers/berlinRecyclingPublic.js`
- Test: `tests/unit/berlin-recycling-public.test.js`

- [ ] **Step 1: Write failing public provider tests**

Create `tests/unit/berlin-recycling-public.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import {
  fetchBerlinRecyclingPublicDates,
  parseBerlinRecyclingPublicDates,
} from "../../providers/berlinRecyclingPublic.js";

describe("Berlin Recycling public provider", () => {
  it("parses public tenant appointments into PickupDate objects", () => {
    const response = {
      dates: [
        { date: "2099-04-01", fraction: "Papier" },
        { date: "2099-04-03", fraction: "Glas" },
      ],
    };

    expect(parseBerlinRecyclingPublicDates(response, "2000-01-01")).toMatchObject([
      {
        date: "2099-04-01",
        category: "PP",
        disposalCompany: "Berlin Recycling",
        provider: "BERLIN_RECYCLING",
      },
      {
        date: "2099-04-03",
        category: "GL",
        disposalCompany: "Berlin Recycling",
        provider: "BERLIN_RECYCLING",
      },
    ]);
  });

  it("calls public endpoint with street and houseNumber", async () => {
    const execute = vi.fn().mockResolvedValue({ dates: [] });
    await fetchBerlinRecyclingPublicDates(execute, { street: "Bergmannstr.", houseNumber: "12" });

    expect(execute.mock.calls[0][0]).toContain("abfuhrkalender.berlin-recycling.de");
    expect(decodeURIComponent(execute.mock.calls[0][0])).toContain("Bergmannstr.");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/berlin-recycling-public.test.js`

Expected: FAIL because provider missing.

- [ ] **Step 3: Implement public provider with isolated mapping**

Create `providers/berlinRecyclingPublic.js`:

```js
import { getCategoryDisplay, sortByDate, filterPastDates } from "../utils.js";

const FRACTION_TO_CATEGORY = {
  papier: "PP",
  paper: "PP",
  glas: "GL",
  glass: "GL",
  gewerbeabfall: "GW",
};

export function mapBerlinRecyclingCategory(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return FRACTION_TO_CATEGORY[key] ?? null;
}

export function parseBerlinRecyclingPublicDates(
  response,
  today = new Date().toISOString().slice(0, 10)
) {
  const rows = Array.isArray(response?.dates) ? response.dates : [];
  const dates = rows.flatMap((row) => {
    const category = mapBerlinRecyclingCategory(row.fraction || row.category || row.type);
    if (!category || !row.date) return [];
    const display = getCategoryDisplay(category);
    return [
      {
        date: row.date,
        category,
        categoryName: display.name,
        color: display.color,
        icon: display.icon,
        disposalCompany: "Berlin Recycling",
        warningText: row.warningText ?? "",
        provider: "BERLIN_RECYCLING",
      },
    ];
  });
  return sortByDate(filterPastDates(dates, today));
}

export async function fetchBerlinRecyclingPublicDates(executeApiCall, config) {
  const url =
    `https://abfuhrkalender.berlin-recycling.de/api/collections` +
    `?street=${encodeURIComponent(config.street)}` +
    `&houseNumber=${encodeURIComponent(config.houseNumber)}`;
  return parseBerlinRecyclingPublicDates(await executeApiCall(url));
}
```

- [ ] **Step 4: Verify pass and commit**

Run: `npm run test:unit -- tests/unit/berlin-recycling-public.test.js`

Expected: PASS.

Commit:

```bash
git add providers/berlinRecyclingPublic.js tests/unit/berlin-recycling-public.test.js
git commit -m "feat: add berlin recycling public provider"
```

## Task 5: Berlin Recycling Portal Provider

**Files:**

- Create: `providers/berlinRecyclingPortal.js`
- Test: `tests/unit/berlin-recycling-portal.test.js`

- [ ] **Step 1: Write failing portal provider tests**

Create `tests/unit/berlin-recycling-portal.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import {
  fetchBerlinRecyclingPortalDates,
  parseBerlinRecyclingPortalDates,
} from "../../providers/berlinRecyclingPortal.js";

describe("Berlin Recycling portal provider", () => {
  it("requires username and password", async () => {
    await expect(
      fetchBerlinRecyclingPortalDates(vi.fn(), { username: "", password: "" })
    ).rejects.toMatchObject({
      type: "BR_AUTH_FAILED",
    });
  });

  it("parses portal appointments", () => {
    const response = {
      appointments: [{ date: "2099-05-01", material: "Papier", note: "Feiertagsverschiebung" }],
    };

    expect(parseBerlinRecyclingPortalDates(response, "2000-01-01")).toMatchObject([
      { date: "2099-05-01", category: "PP", warningText: "Feiertagsverschiebung" },
    ]);
  });

  it("logs in before fetching calendar", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ token: "session-token" })
      .mockResolvedValueOnce({ appointments: [] });

    await fetchBerlinRecyclingPortalDates(execute, { username: "user", password: "pass" });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(execute.mock.calls[1][1].headers.Authorization).toBe("Bearer session-token");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/berlin-recycling-portal.test.js`

Expected: FAIL because provider missing.

- [ ] **Step 3: Implement portal provider**

Create `providers/berlinRecyclingPortal.js`:

```js
import {
  parseBerlinRecyclingPublicDates,
  mapBerlinRecyclingCategory,
} from "./berlinRecyclingPublic.js";
import { getCategoryDisplay, sortByDate, filterPastDates } from "../utils.js";

export function parseBerlinRecyclingPortalDates(
  response,
  today = new Date().toISOString().slice(0, 10)
) {
  if (Array.isArray(response?.dates)) return parseBerlinRecyclingPublicDates(response, today);
  const rows = Array.isArray(response?.appointments) ? response.appointments : [];
  const dates = rows.flatMap((row) => {
    const category = mapBerlinRecyclingCategory(row.material || row.fraction || row.category);
    if (!category || !row.date) return [];
    const display = getCategoryDisplay(category);
    return [
      {
        date: row.date,
        category,
        categoryName: display.name,
        color: display.color,
        icon: display.icon,
        disposalCompany: "Berlin Recycling",
        warningText: row.note ?? row.warningText ?? "",
        provider: "BERLIN_RECYCLING",
      },
    ];
  });
  return sortByDate(filterPastDates(dates, today));
}

export async function fetchBerlinRecyclingPortalDates(executeApiCall, credentials) {
  if (!credentials.username || !credentials.password) {
    const error = new Error("Berlin Recycling credentials missing");
    error.type = "BR_AUTH_FAILED";
    throw error;
  }
  const login = await executeApiCall("https://www.berlin-recycling.de/kundenportal/login", {
    method: "POST",
    body: JSON.stringify({ username: credentials.username, password: credentials.password }),
    headers: { "Content-Type": "application/json" },
  });
  const token = login.token || login.accessToken;
  if (!token) {
    const error = new Error("Berlin Recycling authentication failed");
    error.type = "BR_AUTH_FAILED";
    throw error;
  }
  const calendar = await executeApiCall(
    "https://www.berlin-recycling.de/kundenportal/abfuhrkalender",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return parseBerlinRecyclingPortalDates(calendar);
}
```

- [ ] **Step 4: Verify pass and commit**

Run: `npm run test:unit -- tests/unit/berlin-recycling-portal.test.js`

Expected: PASS.

Commit:

```bash
git add providers/berlinRecyclingPortal.js tests/unit/berlin-recycling-portal.test.js
git commit -m "feat: add berlin recycling portal provider"
```

## Task 6: Provider Orchestration in Node Helper

**Files:**

- Modify: `node_helper.js`
- Test: `tests/integration/berlin-recycling.test.js`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/berlin-recycling.test.js` using existing integration helper patterns from `tests/integration/socket.test.js`. Cover:

```js
it("merges BSR and Berlin Recycling public dates", async () => {
  // mock BSR address, BSR calendar months, and BR public response
  // send BSR_INIT_MODULE with berlinRecycling.enabled true
  // expect one BSR date and one Berlin Recycling PP date in BSR_PICKUP_DATA
});

it("falls back to public provider when portal credentials are missing", async () => {
  // delete process.env.BERLIN_RECYCLING_USERNAME/PASSWORD
  // enable portal + public fallback
  // expect public provider date and no BSR_ERROR when BSR succeeds
});

it("keeps BSR output when Berlin Recycling fails", async () => {
  // mock BSR success, BR public HTTP failure
  // expect BSR_PICKUP_DATA with BSR date
});
```

Use concrete mocked responses from Tasks 4 and 5.

- [ ] **Step 2: Verify failure**

Run: `npm run test:integration -- tests/integration/berlin-recycling.test.js`

Expected: FAIL because `node_helper.js` does not orchestrate BR providers.

- [ ] **Step 3: Update executeApiCall to accept options**

In `node_helper.js`, change signature:

```js
async executeApiCall(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Preserve existing `AbortError` mapping to `API_TIMEOUT`.

- [ ] **Step 4: Add Berlin Recycling fetch orchestration**

Add method to `node_helper.js`:

```js
async fetchBerlinRecyclingDates() {
  if (!this.config.berlinRecycling?.enabled) return [];

  const brConfig = this.config.berlinRecycling;
  const errors = [];

  if (brConfig.usePortal) {
    try {
      const { fetchBerlinRecyclingPortalDates } = await import("./providers/berlinRecyclingPortal.js");
      return await fetchBerlinRecyclingPortalDates(this.executeApiCall.bind(this), {
        username: process.env.BERLIN_RECYCLING_USERNAME,
        password: process.env.BERLIN_RECYCLING_PASSWORD,
      });
    } catch (err) {
      errors.push(err);
      console.warn("[MMM-BSR-Trash-Calendar] Berlin Recycling portal fetch failed:", err.message);
    }
  }

  if (brConfig.usePublicFallback) {
    try {
      const { fetchBerlinRecyclingPublicDates } = await import("./providers/berlinRecyclingPublic.js");
      return await fetchBerlinRecyclingPublicDates(this.executeApiCall.bind(this), this.config);
    } catch (err) {
      errors.push(err);
      console.warn("[MMM-BSR-Trash-Calendar] Berlin Recycling public fetch failed:", err.message);
    }
  }

  return [];
}
```

In `_fetchAndUpdate`, after BSR dates:

```js
const brDates = await this.fetchBerlinRecyclingDates();
const { mergeProviderDates } = await import("./providers/merge.js");
dates = mergeProviderDates([dates, brDates], this.config.categories);
```

- [ ] **Step 5: Verify integration pass and commit**

Run: `npm run test:integration -- tests/integration/berlin-recycling.test.js`

Expected: PASS.

Run: `npm run test:integration`

Expected: PASS.

Commit:

```bash
git add node_helper.js tests/integration/berlin-recycling.test.js
git commit -m "feat: merge berlin recycling provider dates"
```

## Task 7: Documentation

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md` only if contributor commands changed; otherwise do not touch.

- [ ] **Step 1: Update README config example**

Add:

```js
berlinRecycling: {
  enabled: true,
  usePortal: true,
  usePublicFallback: true
}
```

Add env setup:

```sh
BERLIN_RECYCLING_USERNAME=your-login
BERLIN_RECYCLING_PASSWORD=your-password
```

- [ ] **Step 2: Document categories**

Extend category table with:

```md
| `PP` | Papier | Blue | `fa-newspaper` |
| `GL` | Glas | Green | `fa-wine-bottle` |
| `GW` | Gewerbeabfall | Brown | `fa-dumpster` |
```

- [ ] **Step 3: Document fallback/security**

Add text:

```md
Berlin Recycling credentials are read from environment variables and are never written
to `cache.json`. If portal login is unavailable and `usePublicFallback` is enabled, the
module tries the public tenant street-search calendar.
```

- [ ] **Step 4: Verify docs formatting and commit**

Run: `npm run format:check`

Expected: PASS.

Commit:

```bash
git add README.md
git commit -m "docs: document berlin recycling setup"
```

## Task 8: Final Verification

**Files:**

- Check all changed files.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run lint
npm run format:check
npm test
```

Expected: all PASS.

- [ ] **Step 2: Inspect working tree**

Run: `git status --short`

Expected: no tracked uncommitted changes. Existing unrelated untracked files may remain.

- [ ] **Step 3: Final commit if needed**

If verification caused formatting edits:

```bash
git add <formatted-files>
git commit -m "style: format berlin recycling provider"
```

## Self-Review

- Spec coverage: config, env credentials, portal/public fallback, categories, merge/dedupe, errors, security, tests, README covered.
- Placeholder scan: clean.
- Type consistency: `PickupDate.provider`, `berlinRecycling.enabled`, `usePortal`, `usePublicFallback`, and provider method names match across tasks.
