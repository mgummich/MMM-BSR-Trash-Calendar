/**
 * Live BSR API integration tests
 * Requirements: 14.1 – 14.5
 *
 * These tests make real HTTP requests to the BSR API.
 * They only run when the environment variable BSR_LIVE_TESTS=true is set.
 *
 * Run manually:
 *   BSR_LIVE_TESTS=true npx vitest run tests/integration/bsr-api.test.js
 */

import { describe, it, expect, beforeAll } from "vitest";

const LIVE = process.env.BSR_LIVE_TESTS === "true";

// Known test address — Bergmannstr. 12, 10965 Berlin
const TEST_STREET = "Bergmannstr.";
const TEST_HOUSE_NUMBER = "12";

const ADDRESS_LOOKUP_URL = (street, houseNumber) =>
  `https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet` +
  `?searchQuery=${encodeURIComponent(street)}:::${encodeURIComponent(houseNumber)}`;

const CALENDAR_URL = (addressKey, year, month) => {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const dd = String(lastDay).padStart(2, "0");
  return (
    `https://umapi.bsr.de/p/de.bsr.adressen.app/abfuhrEvents` +
    `?filter=AddrKey eq '${addressKey}'` +
    ` and DateFrom eq datetime'${year}-${mm}-01T00:00:00'` +
    ` and DateTo eq datetime'${year}-${mm}-${dd}T00:00:00'` +
    ` and (Category eq 'HM' or Category eq 'BI' or Category eq 'WS' or Category eq 'LT' or Category eq 'WB')`
  );
};

/**
 * Fetches a URL with a 30s timeout. Returns parsed JSON.
 */
async function fetchWithTimeout(url, timeoutMs = 30000) {
  const fetch = require("node-fetch");
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

describe.skipIf(!LIVE)("BSR Live API — Adressauflösung", () => {
  // Requirement 14.3
  it("should resolve a known Berlin address to a valid address key", async () => {
    // Given: A known Berlin test address
    const url = ADDRESS_LOOKUP_URL(TEST_STREET, TEST_HOUSE_NUMBER);

    // When: The BSR address lookup API is called
    const data = await fetchWithTimeout(url);

    // Then: Returns an array with at least one result containing a value field
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(typeof data[0].value).toBe("string");
    expect(data[0].value.length).toBeGreaterThan(0);
  }, 35000);

  it("should return a non-empty address key string for the test address", async () => {
    // Given: The known test address
    const url = ADDRESS_LOOKUP_URL(TEST_STREET, TEST_HOUSE_NUMBER);

    // When: The BSR address lookup API is called
    const data = await fetchWithTimeout(url);

    // Then: The first result has a non-empty string value (format may vary by API version)
    expect(typeof data[0].value).toBe("string");
    expect(data[0].value.length).toBeGreaterThan(0);
  }, 35000);

  it("should return an empty array for an unknown address", async () => {
    // Given: A non-existent address
    const url = ADDRESS_LOOKUP_URL("Nichtexistierendestraße", "999");

    // When: The BSR address lookup API is called
    const data = await fetchWithTimeout(url);

    // Then: Returns an empty array (address not found)
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  }, 35000);
});

describe.skipIf(!LIVE)("BSR Live API — Kalenderabruf", () => {
  let year;
  let month;
  let resolvedAddressKey;

  beforeAll(async () => {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;

    // Resolve the address key dynamically so tests use the current API format
    const url = ADDRESS_LOOKUP_URL(TEST_STREET, TEST_HOUSE_NUMBER);
    const data = await fetchWithTimeout(url);
    resolvedAddressKey = data[0]?.value;
    console.log(`[live test] resolved address key: ${resolvedAddressKey}`);
  });

  // Requirement 14.4
  it("should return a response with a 'dates' field for a known address key", async () => {
    // Given: A dynamically resolved address key and the current month
    const url = CALENDAR_URL(resolvedAddressKey, year, month);

    // When: The BSR calendar API is called
    const data = await fetchWithTimeout(url);

    // Then: Returns an object with a 'dates' field (may be empty if no pickups this month)
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
    expect(data.dates).toBeDefined();
    expect(typeof data.dates).toBe("object");
    expect(data.AddrKey).toBe(resolvedAddressKey);
  }, 35000);

  it("should return valid pickup entries when dates are present", async () => {
    // Given: Try current and next month to find actual pickup data
    const VALID_CATEGORIES = ["BI", "HM", "LT", "WS", "WB"];
    const DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/;

    let foundEntries = false;
    for (let offset = 0; offset <= 3; offset++) {
      const d = new Date(year, month - 1 + offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const url = CALENDAR_URL(resolvedAddressKey, y, m);
      const data = await fetchWithTimeout(url);
      const entries = Object.values(data.dates || {}).flat();

      if (entries.length > 0) {
        foundEntries = true;
        for (const entry of entries) {
          expect(VALID_CATEGORIES).toContain(entry.category);
          expect(entry.serviceDate_actual).toMatch(DATE_PATTERN);
          expect(typeof entry.disposalComp).toBe("string");
        }
        console.log(`[live test] found ${entries.length} entries in month +${offset}`);
        break;
      }
    }

    // Note: if no entries found across 4 months, the API may have changed
    if (!foundEntries) {
      console.warn(
        "[live test] WARNING: No pickup entries found across 4 months — BSR API may have changed"
      );
    }
  }, 35000);

  it("should return pickup dates that can be parsed by parsePickupDates", async () => {
    // Given: A dynamically resolved address key
    const { parsePickupDates } = require("../../utils.js");

    // Try months until we find data or exhaust attempts
    for (let offset = 0; offset <= 3; offset++) {
      const d = new Date(year, month - 1 + offset, 1);
      const url = CALENDAR_URL(resolvedAddressKey, d.getFullYear(), d.getMonth() + 1);
      const data = await fetchWithTimeout(url);
      const parsed = parsePickupDates(data);

      expect(Array.isArray(parsed)).toBe(true);

      if (parsed.length > 0) {
        for (const entry of parsed) {
          expect(typeof entry.date).toBe("string");
          expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(typeof entry.category).toBe("string");
          expect(typeof entry.categoryName).toBe("string");
          expect(typeof entry.disposalCompany).toBe("string");
        }
        console.log(`[live test] parsePickupDates returned ${parsed.length} entries`);
        return;
      }
    }
    console.warn("[live test] WARNING: parsePickupDates returned empty array across 4 months");
  }, 35000);
});
