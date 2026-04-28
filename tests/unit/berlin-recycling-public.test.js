import { describe, it, expect, vi } from "vitest";
import {
  fetchBerlinRecyclingPublicDates,
  parseBerlinRecyclingPublicDates,
} from "../../providers/berlinRecyclingPublic.js";

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

  it("calls public endpoint with street and houseNumber", async () => {
    const execute = vi.fn().mockResolvedValue({ dates: [] });
    await fetchBerlinRecyclingPublicDates(execute, {
      street: "Bergmannstr.",
      houseNumber: "12",
    });

    expect(execute.mock.calls[0][0]).toContain("abfuhrkalender.berlin-recycling.de");
    expect(decodeURIComponent(execute.mock.calls[0][0])).toContain("Bergmannstr.");
  });
});
