/**
 * Property-based tests for cache validation and persistence
 * Feature: mmm-bsr-trash-calendar
 *   Property 10: Cache-Validierung — Intervall bestimmt Aktualisierung
 *   Property 11: Cache Round-Trip — Save und Load
 *   Property 12: Cache-Invalidierung bei Adressänderung
 *
 * Validates: Requirements 11.3, 11.4, 11.7, 11.9
 */

import { describe, it, afterEach } from "vitest";
import * as fc from "fast-check";
import fs from "node:fs";
import { isCacheValid, isCacheAddressMatch, saveCache, loadCache } from "../../utils.js";

const VALID_CATEGORIES = ["BI", "HM", "LT", "WS", "WB"];

// Arbitraries

const pickupDateArb = fc.record({
  date: fc
    .date({ min: new Date("2024-01-01"), max: new Date("2099-12-31") })
    .map((d) => d.toISOString().slice(0, 10)),
  category: fc.constantFrom(...VALID_CATEGORIES),
});

const pickupDatesArb = fc.array(pickupDateArb, { minLength: 0, maxLength: 10 });

const timestampArb = fc.integer({ min: 0, max: 86400000 * 365 });

const streetArb = fc.string({ minLength: 1, maxLength: 30 });
const houseNumberArb = fc.string({ minLength: 1, maxLength: 30 });

// ---------------------------------------------------------------------------
// Property 10: Cache-Validierung — Intervall bestimmt Aktualisierung
// Feature: mmm-bsr-trash-calendar, Property 10: Cache-Validierung — Intervall bestimmt Aktualisierung
// Validates: Requirements 11.3, 11.4
// ---------------------------------------------------------------------------

describe("Property 10: Cache-Validierung — Intervall bestimmt Aktualisierung", () => {
  it("Property 10a: isCacheValid returns false when interval has expired", () => {
    // For any cache state and reference timestamp,
    // isCacheValid must return false when now - lastFetchTimestamp >= interval
    fc.assert(
      fc.property(
        pickupDatesArb,
        streetArb,
        houseNumberArb,
        timestampArb,
        fc.integer({ min: 1, max: 86400000 }),
        (pickupDates, street, houseNumber, lastFetchTimestamp, interval) => {
          // now is exactly at or past the interval boundary
          const now = lastFetchTimestamp + interval;
          const cache = {
            street,
            houseNumber,
            addressKey: `${street}_${houseNumber}`,
            pickupDates,
            lastFetchTimestamp,
          };
          return isCacheValid(cache, {}, now, interval) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 10b: isCacheValid returns true when interval has NOT expired AND cache has at least one future date", () => {
    // When interval has NOT expired AND cache has at least one future date, must return true
    fc.assert(
      fc.property(
        streetArb,
        houseNumberArb,
        fc.integer({ min: 1000, max: 86400000 * 365 }),
        fc.integer({ min: 1, max: 86400000 }),
        (street, houseNumber, lastFetchTimestamp, interval) => {
          // now is strictly before the interval boundary
          const now = lastFetchTimestamp + interval - 1;
          // Ensure at least one future date exists
          const futureDate = new Date(now + 86400000).toISOString().slice(0, 10);
          const cache = {
            street,
            houseNumber,
            addressKey: `${street}_${houseNumber}`,
            pickupDates: [{ date: futureDate, category: "BI" }],
            lastFetchTimestamp,
          };
          return isCacheValid(cache, {}, now, interval) === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Cache Round-Trip — Save und Load
// Feature: mmm-bsr-trash-calendar, Property 11: Cache Round-Trip — Save und Load
// Validates: Requirements 11.7
// ---------------------------------------------------------------------------

describe("Property 11: Cache Round-Trip — Save und Load", () => {
  const tempFiles = [];

  afterEach(() => {
    for (const f of tempFiles.splice(0)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  it("Property 11a: saveCache followed by loadCache produces an equivalent object", () => {
    fc.assert(
      fc.property(
        streetArb,
        houseNumberArb,
        pickupDatesArb,
        timestampArb,
        (street, houseNumber, pickupDates, lastFetchTimestamp) => {
          const filePath = `/tmp/bsr_cache_prop_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
          tempFiles.push(filePath);

          const cacheData = {
            street,
            houseNumber,
            addressKey: `${street}_${houseNumber}`,
            pickupDates,
            lastFetchTimestamp,
          };

          try {
            saveCache(filePath, cacheData);
            const loaded = loadCache(filePath);

            if (loaded === null) {
              return false;
            }
            if (loaded.street !== cacheData.street) {
              return false;
            }
            if (loaded.houseNumber !== cacheData.houseNumber) {
              return false;
            }
            if (loaded.addressKey !== cacheData.addressKey) {
              return false;
            }
            if (loaded.lastFetchTimestamp !== cacheData.lastFetchTimestamp) {
              return false;
            }
            if (loaded.pickupDates.length !== cacheData.pickupDates.length) {
              return false;
            }
            return loaded.pickupDates.every(
              (d, i) =>
                d.date === cacheData.pickupDates[i].date &&
                d.category === cacheData.pickupDates[i].category
            );
          } finally {
            try {
              fs.unlinkSync(filePath);
            } catch {
              // ignore
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Cache-Invalidierung bei Adressänderung
// Feature: mmm-bsr-trash-calendar, Property 12: Cache-Invalidierung bei Adressänderung
// Validates: Requirements 11.9
// ---------------------------------------------------------------------------

describe("Property 12: Cache-Invalidierung bei Adressänderung", () => {
  it("Property 12a: isCacheAddressMatch returns false when street differs", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
          .filter(([a, b]) => a !== b),
        houseNumberArb,
        ([cacheStreet, configStreet], houseNumber) => {
          const cache = {
            street: cacheStreet,
            houseNumber,
            addressKey: `${cacheStreet}_${houseNumber}`,
            pickupDates: [],
            lastFetchTimestamp: 0,
          };
          const config = { street: configStreet, houseNumber };
          return isCacheAddressMatch(cache, config) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 12b: isCacheAddressMatch returns false when houseNumber differs", () => {
    fc.assert(
      fc.property(
        streetArb,
        fc
          .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
          .filter(([a, b]) => a !== b),
        (street, [cacheHouseNumber, configHouseNumber]) => {
          const cache = {
            street,
            houseNumber: cacheHouseNumber,
            addressKey: `${street}_${cacheHouseNumber}`,
            pickupDates: [],
            lastFetchTimestamp: 0,
          };
          const config = { street, houseNumber: configHouseNumber };
          return isCacheAddressMatch(cache, config) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 12c: isCacheAddressMatch returns true when street AND houseNumber match exactly", () => {
    fc.assert(
      fc.property(streetArb, houseNumberArb, (street, houseNumber) => {
        const cache = {
          street,
          houseNumber,
          addressKey: `${street}_${houseNumber}`,
          pickupDates: [],
          lastFetchTimestamp: 0,
        };
        const config = { street, houseNumber };
        return isCacheAddressMatch(cache, config) === true;
      }),
      { numRuns: 100 }
    );
  });
});
