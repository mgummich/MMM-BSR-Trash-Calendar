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

  it("parses Berlin Recycling ASP.NET dataset response", () => {
    const response = {
      d: JSON.stringify({
        Object: {
          data: [
            {
              "Task Date": "2099-05-01",
              "Material Description": "Pappe / Papier / Kartonagen",
            },
          ],
        },
      }),
    };

    expect(parseBerlinRecyclingPortalDates(response, "2000-01-01")).toMatchObject([
      { date: "2099-05-01", category: "PP", disposalCompany: "Berlin Recycling" },
    ]);
  });

  it("rejects malformed Berlin Recycling portal responses", () => {
    expect(() => parseBerlinRecyclingPortalDates({ d: JSON.stringify({ Object: {} }) })).toThrow(
      "Berlin Recycling portal response missing calendar data"
    );
  });

  it("uses the Berlin Recycling portal login flow before fetching calendar", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ body: "", cookies: ["ASP.NET_SessionId=session; path=/"] })
      .mockResolvedValueOnce({ body: { d: true }, cookies: ["auth=token; path=/"] })
      .mockResolvedValueOnce({
        body: "<html></html>",
        cookies: [],
        url: "https://kundenportal.berlin-recycling.de/Default.aspx",
      })
      .mockResolvedValueOnce({ d: "{}" })
      .mockResolvedValueOnce({ d: JSON.stringify({ Object: { data: [] } }) });

    await fetchBerlinRecyclingPortalDates(execute, { username: "user", password: "pass" });

    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls[0][0]).toBe("https://kundenportal.berlin-recycling.de/");
    expect(execute.mock.calls[0][1]).toMatchObject({
      allowRedirectStatus: true,
      redirect: "manual",
      responseType: "text",
    });
    expect(execute.mock.calls[1][0]).toBe(
      "https://kundenportal.berlin-recycling.de/Login.aspx/Auth"
    );
    expect(execute.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(execute.mock.calls[4][0]).toBe(
      "https://kundenportal.berlin-recycling.de/Default.aspx/GetDatasetTableHead"
    );
    expect(execute.mock.calls[4][1].body).toContain("ABFUHRKALENDER");
    expect(execute.mock.calls[4][1].headers.Cookie).toContain("ASP.NET_SessionId=session");
    expect(execute.mock.calls[4][1].headers.Cookie).toContain("auth=token");
  });
});
