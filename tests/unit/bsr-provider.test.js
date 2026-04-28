import { describe, it, expect, vi } from "vitest";
import { resolveBsrAddress, fetchBsrPickupDates } from "../../providers/bsr.js";
import * as utils from "../../utils.js";

describe("BSR provider", () => {
  it("resolves first address value", async () => {
    const execute = vi.fn().mockResolvedValue([{ value: "10965_Bergmannstr._12" }]);

    await expect(resolveBsrAddress(execute, "Bergmannstr.", "12")).resolves.toBe(
      "10965_Bergmannstr._12"
    );
  });

  it("returns null for empty address result", async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await expect(resolveBsrAddress(execute, "Missing", "1")).resolves.toBeNull();
  });

  it("fetches current and next month and parses dates", async () => {
    const execute = vi.fn().mockResolvedValue({ dates: {} });
    const parsed = await fetchBsrPickupDates(
      execute,
      utils,
      "addr-key",
      new Date("2099-12-15T00:00:00Z")
    );

    expect(parsed).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0]).toContain("2099-12-01T00:00:00");
    expect(execute.mock.calls[1][0]).toContain("2100-01-01T00:00:00");
  });
});
