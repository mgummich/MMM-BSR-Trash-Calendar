/**
 * Property-based tests for category filtering / sanitization
 * Feature: mmm-bsr-trash-calendar
 *   Property 4: Kategoriefilterung liefert nur konfigurierte Kategorien
 *   Property 8: Idempotenz der Kategoriefilterung
 *   Property 13: Kategorie-Bereinigung — Fallback auf alle Kategorien
 *
 * Validates: Requirements 5.3, 9.6, 12.3, 12.4, 12.6
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { filterByCategories, sanitizeCategories } from "../../utils.js";

const VALID_CATEGORIES = ["BI", "HM", "LT", "WS", "WB"];

// Arbitraries

/** Generates a valid PickupDate-like object with a given category */
const pickupDateArb = (category) =>
  fc.record({
    date: fc
      .date({ min: new Date("2024-01-01"), max: new Date("2026-12-31") })
      .map((d) => d.toISOString().slice(0, 10)),
    category: fc.constant(category),
    categoryName: fc.string({ minLength: 1, maxLength: 20 }),
    color: fc.constant("#000000"),
    icon: fc.constant("fa-trash"),
    disposalCompany: fc.constantFrom("BSR", "ALBA"),
    warningText: fc.string(),
  });

/** Generates an array of PickupDate objects with random valid categories */
const pickupDatesArb = fc.array(
  fc.constantFrom(...VALID_CATEGORIES).chain((cat) => pickupDateArb(cat)),
  { minLength: 0, maxLength: 20 }
);

/** Generates a non-empty subset of valid categories */
const categorySubsetArb = fc
  .array(fc.constantFrom(...VALID_CATEGORIES), { minLength: 1, maxLength: 5 })
  .map((arr) => [...new Set(arr)]);

// ---------------------------------------------------------------------------
// Property 4: Kategoriefilterung liefert nur konfigurierte Kategorien
// Feature: mmm-bsr-trash-calendar, Property 4: Kategoriefilterung liefert nur konfigurierte Kategorien
// Validates: Requirements 5.3, 12.3
// ---------------------------------------------------------------------------

describe("Property 4: Kategoriefilterung liefert nur konfigurierte Kategorien", () => {
  it("Property 4a: Every entry in the result has a category from the configured set", () => {
    // For any list of pickup dates and any subset of categories,
    // filterByCategories must return only entries whose category is in the subset.
    fc.assert(
      fc.property(pickupDatesArb, categorySubsetArb, (dates, cats) => {
        const result = filterByCategories(dates, cats);
        return result.every((d) => cats.includes(d.category));
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4b: No entry with a configured category is missing from the result", () => {
    // For any list of pickup dates and any subset of categories,
    // every entry in the input whose category is in the subset must appear in the result.
    fc.assert(
      fc.property(pickupDatesArb, categorySubsetArb, (dates, cats) => {
        const catSet = new Set(cats);
        const expected = dates.filter((d) => catSet.has(d.category));
        const result = filterByCategories(dates, cats);
        return result.length === expected.length;
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4c: Filtering with all valid categories returns all entries", () => {
    fc.assert(
      fc.property(pickupDatesArb, (dates) => {
        const result = filterByCategories(dates, VALID_CATEGORIES);
        return result.length === dates.length;
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4d: Filtering with an empty category list returns an empty array", () => {
    fc.assert(
      fc.property(pickupDatesArb, (dates) => {
        const result = filterByCategories(dates, []);
        return result.length === 0;
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Idempotenz der Kategoriefilterung
// Feature: mmm-bsr-trash-calendar, Property 8: Idempotenz der Kategoriefilterung
// Validates: Requirements 9.6
// ---------------------------------------------------------------------------

describe("Property 8: Idempotenz der Kategoriefilterung", () => {
  it("Property 8a: Applying filterByCategories twice yields the same result as once", () => {
    // filterByCategories(filterByCategories(dates, cats), cats) === filterByCategories(dates, cats)
    fc.assert(
      fc.property(pickupDatesArb, categorySubsetArb, (dates, cats) => {
        const once = filterByCategories(dates, cats);
        const twice = filterByCategories(once, cats);
        if (once.length !== twice.length) {
          return false;
        }
        return once.every((d, i) => d === twice[i]);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 8b: Idempotency holds for single-category filter", () => {
    fc.assert(
      fc.property(
        pickupDatesArb,
        fc.constantFrom(...VALID_CATEGORIES).map((c) => [c]),
        (dates, cats) => {
          const once = filterByCategories(dates, cats);
          const twice = filterByCategories(once, cats);
          return once.length === twice.length && once.every((d, i) => d === twice[i]);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Kategorie-Bereinigung — Fallback auf alle Kategorien
// Feature: mmm-bsr-trash-calendar, Property 13: Kategorie-Bereinigung — Fallback auf alle Kategorien
// Validates: Requirements 12.4, 12.6
// ---------------------------------------------------------------------------

describe("Property 13: Kategorie-Bereinigung — Fallback auf alle Kategorien", () => {
  it("Property 13a: For any array of strings → result contains only valid categories", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (categories) => {
        const result = sanitizeCategories(categories);
        return result.every((c) => VALID_CATEGORIES.includes(c));
      }),
      { numRuns: 100 }
    );
  });

  it("Property 13b: For any empty array → result equals all valid categories", () => {
    fc.assert(
      fc.property(fc.constant([]), (categories) => {
        const result = sanitizeCategories(categories);
        return (
          result.length === VALID_CATEGORIES.length &&
          VALID_CATEGORIES.every((c) => result.includes(c))
        );
      }),
      { numRuns: 100 }
    );
  });

  it("Property 13c: For any array with only invalid strings → result equals all valid categories", () => {
    // Generate strings that are guaranteed not to be valid category codes
    fc.assert(
      fc.property(
        fc.array(
          fc.string().filter((s) => !VALID_CATEGORIES.includes(s)),
          { minLength: 1 }
        ),
        (categories) => {
          const result = sanitizeCategories(categories);
          return (
            result.length === VALID_CATEGORIES.length &&
            VALID_CATEGORIES.every((c) => result.includes(c))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 13d: For any array with at least one valid category → result contains only valid categories and no invalid ones", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...VALID_CATEGORIES), { minLength: 1 }), (validPart) => {
        // Mix valid with some arbitrary strings
        const result = sanitizeCategories(validPart);
        return (
          result.length > 0 &&
          result.every((c) => VALID_CATEGORIES.includes(c)) &&
          result.every((c) => !result.includes(c) || VALID_CATEGORIES.includes(c))
        );
      }),
      { numRuns: 100 }
    );
  });
});
