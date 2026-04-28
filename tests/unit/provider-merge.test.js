import { describe, it, expect } from "vitest";
import { mergeProviderDates } from "../../providers/merge.js";

const base = {
  categoryName: "Hausmüll",
  color: "#808080",
  icon: "fa-trash",
  warningText: "",
};

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
