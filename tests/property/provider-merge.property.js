import { describe, it } from "vitest";
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
