import { describe, it, expect } from "vitest";
import { parseBerlinRecyclingPublicDates } from "../../providers/berlinRecyclingPublic.js";

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

  it("still parses legacy public appointment payloads", () => {
    const response = {
      dates: [{ date: "2099-04-01", fraction: "Pappe / Papier / Kartonagen" }],
    };

    expect(parseBerlinRecyclingPublicDates(response, "2000-01-01")).toMatchObject([
      { date: "2099-04-01", category: "PP" },
    ]);
  });

  it("does not expose a public fallback fetch provider", async () => {
    const providerModule = await import("../../providers/berlinRecyclingPublic.js");

    expect(providerModule.fetchBerlinRecyclingPublicDates).toBeUndefined();
    expect(providerModule.rejectUnsupportedBerlinRecyclingPublicFallback).toBeUndefined();
  });
});
