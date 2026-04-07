/**
 * Property-based tests for BSR API response parsing
 * Feature: mmm-bsr-trash-calendar, Property 1: Parsing erzeugt sortierte, vollständige Terminliste
 * Feature: mmm-bsr-trash-calendar, Property 7: Round-Trip — Parse und Serialize
 *
 * Validates: Requirements 3.1, 9.3, 9.5
 */

// Feature: mmm-bsr-trash-calendar, Property 1: Parsing erzeugt sortierte, vollständige Terminliste
// Feature: mmm-bsr-trash-calendar, Property 7: Round-Trip — Parse und Serialize

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { parsePickupDates, serializePickupDate, CATEGORY_MAP } from "../../utils.js";

// **Validates: Requirements 3.1, 9.3**

const VALID_CATEGORIES = ["BI", "HM", "LT", "WS", "WB"];
const DISPOSAL_COMPANIES = ["BSR", "ALBA"];
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];

/**
 * Generates a random future date string in "dd.MM.yyyy" format.
 * Dates are generated in the range [today, today + 365 days].
 */
const futureDateArb = (todayStr) => {
  const today = new Date(todayStr);
  return fc.integer({ min: 0, max: 365 }).map((offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return { ddMMyyyy: `${dd}.${mm}.${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
  });
};

/**
 * Generates a single BSR API entry with a future serviceDate_actual.
 */
const entryArb = (todayStr) =>
  fc.record({
    category: fc.constantFrom(...VALID_CATEGORIES),
    serviceDay: fc.constantFrom(...WEEKDAYS),
    serviceDate_actual: futureDateArb(todayStr).map((d) => d.ddMMyyyy),
    serviceDate_regular: futureDateArb(todayStr).map((d) => d.ddMMyyyy),
    rhythm: fc.string({ minLength: 1, maxLength: 20 }),
    warningText: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 50 })),
    disposalComp: fc.constantFrom(...DISPOSAL_COMPANIES),
  });

/**
 * Generates a valid BSR CalendarEventsResponse with 1–10 date keys,
 * each containing 1–3 entries with future dates.
 */
const apiResponseArb = (todayStr) => {
  const dateKeyArb = futureDateArb(todayStr).map((d) => d.iso);
  return fc
    .array(fc.tuple(dateKeyArb, fc.array(entryArb(todayStr), { minLength: 1, maxLength: 3 })), {
      minLength: 1,
      maxLength: 10,
    })
    .map((pairs) => {
      const dates = {};
      for (const [key, entries] of pairs) {
        dates[key] = entries;
      }
      return { dates };
    });
};

describe("Property 1: Parsing erzeugt sortierte, vollständige Terminliste", () => {
  it("Property 1a: Result is sorted ascending by date", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    fc.assert(
      fc.property(apiResponseArb(todayStr), (apiResponse) => {
        const result = parsePickupDates(apiResponse, todayStr);
        for (let i = 1; i < result.length; i++) {
          if (result[i - 1].date > result[i].date) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it("Property 1b: Result contains only future dates (>= today)", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    fc.assert(
      fc.property(apiResponseArb(todayStr), (apiResponse) => {
        const result = parsePickupDates(apiResponse, todayStr);
        return result.every((entry) => entry.date >= todayStr);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 1c: serviceDate_actual (dd.MM.yyyy) is correctly converted to ISO format (YYYY-MM-DD)", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    fc.assert(
      fc.property(apiResponseArb(todayStr), (apiResponse) => {
        const result = parsePickupDates(apiResponse, todayStr);
        // Collect all serviceDate_actual values from the input
        const inputDates = new Set();
        for (const entries of Object.values(apiResponse.dates)) {
          for (const entry of entries) {
            const [dd, mm, yyyy] = entry.serviceDate_actual.split(".");
            inputDates.add(`${yyyy}-${mm}-${dd}`);
          }
        }
        // Every date in the result must be a valid ISO conversion of an input date
        return result.every((entry) => {
          // Validate ISO format: YYYY-MM-DD
          if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
            return false;
          }
          return inputDates.has(entry.date);
        });
      }),
      { numRuns: 100 }
    );
  });
});

// **Validates: Requirements 9.5**

/**
 * Generates a valid PickupDate with a future date.
 */
const pickupDateArb = (todayStr) => {
  const today = new Date(todayStr);
  const validCategories = Object.keys(CATEGORY_MAP);
  return fc
    .record({
      category: fc.constantFrom(...validCategories),
      offsetDays: fc.integer({ min: 0, max: 365 }),
      disposalCompany: fc.constantFrom("BSR", "ALBA"),
      warningText: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 50 })),
    })
    .map(({ category, offsetDays, disposalCompany, warningText }) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offsetDays);
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const info = CATEGORY_MAP[category];
      return {
        date: isoDate,
        category,
        categoryName: info.name,
        color: info.color,
        icon: info.icon,
        disposalCompany,
        warningText,
      };
    });
};

describe("Property 7: Round-Trip — Parse und Serialize", () => {
  it("Property 7: serialize then parse yields an equivalent PickupDate", () => {
    // **Validates: Requirements 9.5**
    const todayStr = new Date().toISOString().slice(0, 10);
    fc.assert(
      fc.property(pickupDateArb(todayStr), (original) => {
        const serialized = serializePickupDate(original);
        const parsed = parsePickupDates(serialized, todayStr);

        // There must be exactly one result matching the original date + category
        const match = parsed.find(
          (e) => e.date === original.date && e.category === original.category
        );
        if (!match) {
          return false;
        }

        return (
          match.date === original.date &&
          match.category === original.category &&
          match.categoryName === original.categoryName &&
          match.color === original.color &&
          match.icon === original.icon &&
          match.disposalCompany === original.disposalCompany &&
          match.warningText === original.warningText
        );
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: mmm-bsr-trash-calendar, Property 9: Ungültige Eingaben erzeugen definierten Fehler
// **Validates: Requirements 9.7**

/**
 * Generates arbitrary invalid API responses — values that are NOT a valid
 * CalendarEventsResponse (i.e. missing 'dates', wrong type, null, etc.).
 */
const invalidApiResponseArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(42),
  fc.constant("string"),
  fc.constant(true),
  fc.constant([]),
  fc.constant({}), // missing 'dates' field
  fc.record({ dates: fc.constant(null) }), // dates is null
  fc.record({ dates: fc.constant([]) }), // dates is array, not object
  fc.record({ dates: fc.constant("str") }), // dates is string
  fc.record({ dates: fc.constant(42) }), // dates is number
  // Object with dates containing entries missing required fields
  fc.record({
    dates: fc.record({
      "2025-01-01": fc.array(
        fc.record({
          // category intentionally omitted
          serviceDate_actual: fc.constant("01.01.2025"),
          disposalComp: fc.constant("BSR"),
          warningText: fc.constant(""),
        }),
        { minLength: 1, maxLength: 2 }
      ),
    }),
  }),
  fc.record({
    dates: fc.record({
      "2025-01-01": fc.array(
        fc.record({
          category: fc.constant("HM"),
          // serviceDate_actual intentionally omitted
          disposalComp: fc.constant("BSR"),
          warningText: fc.constant(""),
        }),
        { minLength: 1, maxLength: 2 }
      ),
    }),
  })
);

describe("Property 9: Ungültige Eingaben erzeugen definierten Fehler", () => {
  it("Property 9: parsePickupDates throws a defined Error for any invalid input — never an unhandled exception", () => {
    // **Validates: Requirements 9.7**
    fc.assert(
      fc.property(invalidApiResponseArb, (invalidInput) => {
        try {
          parsePickupDates(invalidInput);
          // If it didn't throw, that's only acceptable if the input happened to be
          // technically valid (e.g. an object with a valid dates field). Since our
          // arbitraries are designed to be invalid, reaching here is a failure.
          return false;
        } catch (err) {
          // Must be a proper Error instance with a non-empty message — not an
          // unhandled TypeError or similar that leaks internal details without context.
          return err instanceof Error && typeof err.message === "string" && err.message.length > 0;
        }
      }),
      { numRuns: 100 }
    );
  });
});
