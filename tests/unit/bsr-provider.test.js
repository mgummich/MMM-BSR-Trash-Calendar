import { describe, it, expect, vi } from "vitest";
import { URL } from "node:url";
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
    expect(new URL(execute.mock.calls[0][0]).searchParams.get("filter")).toContain(
      "2099-12-01T00:00:00"
    );
    expect(new URL(execute.mock.calls[1][0]).searchParams.get("filter")).toContain(
      "2100-01-01T00:00:00"
    );
  });

  it("keeps special address keys inside one encoded OData filter parameter", async () => {
    const execute = vi.fn().mockResolvedValue({ dates: {} });
    const addressKey = "key'&?#%\r\nvalue";

    await fetchBsrPickupDates(execute, utils, addressKey, new Date("2099-12-15T00:00:00Z"));

    expect(execute).toHaveBeenCalledTimes(2);
    for (const [rawUrl] of execute.mock.calls) {
      const url = new URL(rawUrl);
      expect(url.hostname).toBe("umapi.bsr.de");
      expect(url.pathname).toBe("/p/de.bsr.adressen.app/abfuhrEvents");
      expect(url.hash).toBe("");
      expect([...url.searchParams.keys()]).toEqual(["filter"]);

      const filter = url.searchParams.get("filter");
      expect(filter).toContain(`AddrKey eq '${addressKey.replace(/'/g, "''")}'`);
      expect(filter).toContain("Category eq 'HM' or Category eq 'BI'");
      expect(filter).toContain("DateFrom eq datetime'");
      expect(filter).toContain("DateTo eq datetime'");
    }
  });
});
