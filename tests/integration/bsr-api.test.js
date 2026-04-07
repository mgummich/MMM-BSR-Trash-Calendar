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
const TEST_ADDRESS_KEY = "10965_Bergmannstr._12";

const ADDRESS_LOOKUP_URL = (street, houseNumber) =>
  `https://umnewforms.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet` +
  `?searchQuery=${encodeURIComponent(street)}:::${encodeURIComponent(houseNumber)}`;

const CALENDAR_URL = (addressKey, year, month) => {
  const mm = String(month).padStart(2, "0");
  return (
    `https://umnewforms.bsr.de/p/de.bsr.adressen.app/abfuhrEvents` +
    `?filter=AddrKey eq '${addressKey}'` +
    ` and DateFrom eq datetime'${year}-${mm}-01T00:00:00'` +
    ` and DateTo eq datetime'${year}-${mm}-01T00:00:00'`
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

  it("should return the expected address key for the test address", async () => {
    // Given: The known test address
    const url = ADDRESS_LOOKUP_URL(TEST_STREET, TEST_HOUSE_NUMBER);

    // When: The BSR address lookup API is called
    const data = await fetchWithTimeout(url);

    // Then: The first result matches the expected address key
    expect(data[0].value).toBe(TEST_ADDRESS_KEY);
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

  beforeAll(() => {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  });

  // Requirement 14.4
  it("should return pickup dates for a known address key", async () => {
    // Given: A known address key and the current month
    const url = CALENDAR_URL(TEST_ADDRESS_KEY, year, month);

    // When: The BSR calendar API is called
    const data = await fetchWithTimeout(url);

    // Then: Returns an object with a 'dates' field
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
    expect(data.dates).toBeDefined();
    expect(typeof data.dates).toBe("object");
  }, 35000);

  it("should return dates with valid category and serviceDate_actual fields", async () => {
    // Given: A known address key and the current month
    const url = CALENDAR_URL(TEST_ADDRESS_KEY, year, month);

    // When: The BSR calendar API is called
    const data = await fetchWithTimeout(url);

    // Then: Each entry has required fields
    const VALID_CATEGORIES = ["BI", "HM", "LT", "WS", "WB"];
    const DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/;

    for (const entries of Object.values(data.dates)) {
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries) {
        expect(VALID_CATEGORIES).toContain(entry.category);
        expect(entry.serviceDate_actual).toMatch(DATE_PATTERN);
        expect(typeof entry.disposalComp).toBe("string");
      }
    }
  }, 35000);

  it("should return pickup dates that can be parsed by parsePickupDates", async () => {
    // Given: A known address key and the current month
    const { parsePickupDates } = require("../../utils.js");
    const url = CALENDAR_URL(TEST_ADDRESS_KEY, year, month);

    // When: The BSR calendar API is called and response is parsed
    const data = await fetchWithTimeout(url);
    const parsed = parsePickupDates(data);

    // Then: Returns an array of valid PickupDate objects
    expect(Array.isArray(parsed)).toBe(true);
    for (const entry of parsed) {
      expect(typeof entry.date).toBe("string");
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.category).toBe("string");
      expect(typeof entry.categoryName).toBe("string");
      expect(typeof entry.disposalCompany).toBe("string");
    }
  }, 35000);
});
