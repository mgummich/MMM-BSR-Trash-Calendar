import { describe, it, expect, vi } from "vitest";
import {
  fetchBerlinRecyclingPortalDates,
  parseBerlinRecyclingPortalDates,
} from "../../providers/berlinRecyclingPortal.js";

describe("Berlin Recycling portal provider", () => {
  it("requires username and password", async () => {
    await expect(
      fetchBerlinRecyclingPortalDates(vi.fn(), { username: "", password: "" })
    ).rejects.toMatchObject({
      type: "BR_AUTH_FAILED",
    });
  });

  it("parses portal appointments", () => {
    const response = {
      appointments: [{ date: "2099-05-01", material: "Papier", note: "Feiertagsverschiebung" }],
    };

    expect(parseBerlinRecyclingPortalDates(response, "2000-01-01")).toMatchObject([
      { date: "2099-05-01", category: "PP", warningText: "Feiertagsverschiebung" },
    ]);
  });

  it("logs in before fetching calendar", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ token: "session-token" })
      .mockResolvedValueOnce({ appointments: [] });

    await fetchBerlinRecyclingPortalDates(execute, { username: "user", password: "pass" });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(execute.mock.calls[1][1].headers.Authorization).toBe("Bearer session-token");
  });
});
