/**
 * Property-based tests for month range calculation
 * Feature: mmm-bsr-trash-calendar, Property 15: Monatsbereich mit Jahreswechsel
 *
 * Validates: Requirements 2.2
 */

// Feature: mmm-bsr-trash-calendar, Property 15: Monatsbereich mit Jahreswechsel

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { getMonthRange } from "../../utils.js";

/**
 * Arbitrary that generates a Date for any day in any month/year.
 * Range: 2000-01-01 to 2099-12-31
 */
const dateArb = fc
  .record({
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // use 1–28 to stay valid for all months
  })
  .map(({ year, month, day }) => new Date(year, month - 1, day));

describe("Property 15: Monatsbereich mit Jahreswechsel", () => {
  it("Property 15a: getMonthRange always returns exactly two entries", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(dateArb, (date) => {
        const result = getMonthRange(date);
        return Array.isArray(result) && result.length === 2;
      }),
      { numRuns: 200 }
    );
  });

  it("Property 15b: first entry always matches the month and year of the input date", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(dateArb, (date) => {
        const result = getMonthRange(date);
        const [current] = result;
        return current.year === date.getFullYear() && current.month === date.getMonth() + 1;
      }),
      { numRuns: 200 }
    );
  });

  it("Property 15c: second entry is always the month immediately following the first", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(dateArb, (date) => {
        const [current, next] = getMonthRange(date);
        if (current.month === 12) {
          return next.year === current.year + 1 && next.month === 1;
        }
        return next.year === current.year && next.month === current.month + 1;
      }),
      { numRuns: 200 }
    );
  });

  it("Property 15d: December → January year rollover is handled correctly", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2098 }).map((year) => new Date(year, 11, 15)), // month 11 = December
        (decemberDate) => {
          const [current, next] = getMonthRange(decemberDate);
          return (
            current.month === 12 &&
            current.year === decemberDate.getFullYear() &&
            next.month === 1 &&
            next.year === decemberDate.getFullYear() + 1
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 15e: both entries always have valid month values (1–12)", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(dateArb, (date) => {
        const [current, next] = getMonthRange(date);
        return current.month >= 1 && current.month <= 12 && next.month >= 1 && next.month <= 12;
      }),
      { numRuns: 200 }
    );
  });
});
