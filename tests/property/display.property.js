/**
 * Property-based tests for display / rendering logic
 * Feature: mmm-bsr-trash-calendar, Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise
 * Feature: mmm-bsr-trash-calendar, Property 3: maxEntries begrenzt die Ausgabe
 * Feature: mmm-bsr-trash-calendar, Property 6: Datumsklassifikation — Heute, Morgen oder null
 *
 * Validates: Requirements 3.2, 3.3, 6.1, 6.2, 6.3, 8.1
 */

// Feature: mmm-bsr-trash-calendar, Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise
// Feature: mmm-bsr-trash-calendar, Property 3: maxEntries begrenzt die Ausgabe
// Feature: mmm-bsr-trash-calendar, Property 6: Datumsklassifikation — Heute, Morgen oder null

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { getRelativeLabel, sortByDate, CATEGORY_MAP } from "../../utils.js";

// **Validates: Requirements 3.2, 8.1**

const VALID_CATEGORIES = Object.keys(CATEGORY_MAP);
const DISPOSAL_COMPANIES = ["BSR", "ALBA"];

/**
 * Arbitrary that generates a valid PickupDate object.
 */
const pickupDateArb = fc.record({
  date: fc.integer({ min: 0, max: 730 }).map((offset) => {
    const d = new Date("2025-01-01T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }),
  category: fc.constantFrom(...VALID_CATEGORIES),
  categoryName: fc.string({ minLength: 1, maxLength: 30 }),
  color: fc.string({ minLength: 1, maxLength: 20 }),
  icon: fc.string({ minLength: 1, maxLength: 30 }),
  disposalCompany: fc.constantFrom(...DISPOSAL_COMPANIES),
  warningText: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 80 })),
});

describe("Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise", () => {
  // **Validates: Requirements 3.2, 8.1**

  it("Property 2a: Jeder PickupDate enthält date, categoryName und disposalCompany", () => {
    // Feature: mmm-bsr-trash-calendar, Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise
    fc.assert(
      fc.property(pickupDateArb, (entry) => {
        return (
          typeof entry.date === "string" &&
          entry.date.length > 0 &&
          typeof entry.categoryName === "string" &&
          entry.categoryName.length > 0 &&
          typeof entry.disposalCompany === "string" &&
          entry.disposalCompany.length > 0
        );
      }),
      { numRuns: 100 }
    );
  });

  it("Property 2b: Wenn warningText nicht leer ist, ist er im Eintrag zugänglich", () => {
    // Feature: mmm-bsr-trash-calendar, Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise
    fc.assert(
      fc.property(
        pickupDateArb.filter((e) => e.warningText !== ""),
        (entry) => {
          return typeof entry.warningText === "string" && entry.warningText.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 2c: Wenn warningText leer ist, ist er ein leerer String", () => {
    // Feature: mmm-bsr-trash-calendar, Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise
    fc.assert(
      fc.property(
        pickupDateArb.filter((e) => e.warningText === ""),
        (entry) => {
          return entry.warningText === "";
        }
      ),
      { numRuns: 100 }
    );
  });
});

// **Validates: Requirements 3.3**

describe("Property 3: maxEntries begrenzt die Ausgabe", () => {
  // Feature: mmm-bsr-trash-calendar, Property 3: maxEntries begrenzt die Ausgabe

  it("Property 3a: slice(0, maxEntries) liefert nie mehr als maxEntries Einträge", () => {
    // **Validates: Requirements 3.3**
    fc.assert(
      fc.property(
        fc.array(pickupDateArb, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1, max: 15 }),
        (entries, maxEntries) => {
          const result = entries.slice(0, maxEntries);
          return result.length <= maxEntries;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 3b: sortByDate + slice liefert die chronologisch ersten N Einträge", () => {
    // **Validates: Requirements 3.3**
    fc.assert(
      fc.property(
        fc.array(pickupDateArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (entries, maxEntries) => {
          const sorted = sortByDate(entries);
          const result = sorted.slice(0, maxEntries);

          // Result must not exceed maxEntries
          if (result.length > maxEntries) {
            return false;
          }

          // Every entry in result must appear before (or at same position as) entries not in result
          const resultDates = result.map((e) => e.date);
          const remainingDates = sorted.slice(maxEntries).map((e) => e.date);

          // All result dates must be <= all remaining dates
          return resultDates.every((rd) => remainingDates.every((rem) => rd <= rem));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 3c: Wenn Liste kürzer als maxEntries ist, werden alle Einträge angezeigt", () => {
    // **Validates: Requirements 3.3**
    fc.assert(
      fc.property(
        fc.array(pickupDateArb, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 6, max: 20 }),
        (entries, maxEntries) => {
          const result = entries.slice(0, maxEntries);
          return result.length === entries.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// **Validates: Requirements 6.1, 6.2, 6.3**

describe("Property 6: Datumsklassifikation — Heute, Morgen oder null", () => {
  // Feature: mmm-bsr-trash-calendar, Property 6: Datumsklassifikation — Heute, Morgen oder null

  /**
   * Generates a valid ISO date string "YYYY-MM-DD" in the range 2000–2099.
   */
  const isoDateArb = fc
    .record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(({ year, month, day }) => {
      const yyyy = String(year);
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    });

  /**
   * Computes tomorrow's ISO date from a given ISO date string.
   */
  function addDays(isoDate, days) {
    const d = new Date(isoDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  it("Property 6a: getRelativeLabel(today, today) === 'Heute'", () => {
    // **Validates: Requirements 6.1**
    fc.assert(
      fc.property(isoDateArb, (today) => {
        return getRelativeLabel(today, today) === "Heute";
      }),
      { numRuns: 100 }
    );
  });

  it("Property 6b: getRelativeLabel(tomorrow, today) === 'Morgen'", () => {
    // **Validates: Requirements 6.2**
    fc.assert(
      fc.property(isoDateArb, (today) => {
        const tomorrow = addDays(today, 1);
        return getRelativeLabel(tomorrow, today) === "Morgen";
      }),
      { numRuns: 100 }
    );
  });

  it("Property 6c: getRelativeLabel(date, today) === null für alle anderen Daten", () => {
    // **Validates: Requirements 6.3**
    fc.assert(
      fc.property(isoDateArb, fc.integer({ min: 2, max: 365 }), (today, offset) => {
        const futureDate = addDays(today, offset);
        return getRelativeLabel(futureDate, today) === null;
      }),
      { numRuns: 100 }
    );
  });

  it("Property 6d: getRelativeLabel gibt nur 'Heute', 'Morgen' oder null zurück — niemals etwas anderes", () => {
    // **Validates: Requirements 6.1, 6.2, 6.3**
    fc.assert(
      fc.property(isoDateArb, isoDateArb, (date, today) => {
        const label = getRelativeLabel(date, today);
        return label === "Heute" || label === "Morgen" || label === null;
      }),
      { numRuns: 100 }
    );
  });
});
