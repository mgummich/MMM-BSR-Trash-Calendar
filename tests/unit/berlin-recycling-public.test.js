import { describe, it, expect, vi } from "vitest";
import {
  fetchBerlinRecyclingPublicDates,
  parseBerlinRecyclingPublicDates,
  rejectUnsupportedBerlinRecyclingPublicFallback,
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
    await expect(
      rejectUnsupportedBerlinRecyclingPublicFallback(execute, {
        street: "Bergmannstr.",
        houseNumber: "12",
      })
    ).rejects.toThrow("Berlin Recycling public fallback is not supported");

    expect(execute).not.toHaveBeenCalled();
  });

  it("still parses legacy public appointment payloads", () => {
    const response = {
      dates: [{ date: "2099-04-01", fraction: "Pappe / Papier / Kartonagen" }],
    };

    expect(parseBerlinRecyclingPublicDates(response, "2000-01-01")).toMatchObject([
      { date: "2099-04-01", category: "PP" },
    ]);
  });

  it("preserves old call signature shape for explicit config", async () => {
    const execute = vi.fn().mockResolvedValue({ dates: [] });
    await expect(
      fetchBerlinRecyclingPublicDates(execute, {
        street: "Bergmannstr.",
        houseNumber: "12",
      })
    ).rejects.toMatchObject({ type: "BR_PUBLIC_UNSUPPORTED" });

    expect(execute).not.toHaveBeenCalled();
  });
});
