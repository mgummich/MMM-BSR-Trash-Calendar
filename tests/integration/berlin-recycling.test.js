import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const NODE_HELPER_FILE = path.resolve(TEST_DIR, "../../node_helper.js");
const requireFromNodeHelper = createRequire(NODE_HELPER_FILE);

const VALID_CONFIG = {
  street: "Bergmannstr.",
  houseNumber: "12",
  dateFormat: "dd.MM.yyyy",
  maxEntries: 5,
  updateInterval: 86400000,
  categories: ["HM", "PP"],
  berlinRecycling: {
    enabled: true,
    usePortal: true,
    usePublicFallback: true,
  },
};

function bsrAddressResponse() {
  return [{ value: "10965_Bergmannstr._12", label: "Bergmannstr. 12, 10965 Berlin" }];
}

function bsrCalendarResponse(date = "2099-06-15") {
  const [yyyy, mm, dd] = date.split("-");
  return {
    dates: {
      [date]: [
        {
          category: "HM",
          serviceDay: "Montag",
          serviceDate_actual: `${dd}.${mm}.${yyyy}`,
          serviceDate_regular: `${dd}.${mm}.${yyyy}`,
          rhythm: "14-täglich",
          warningText: "",
          disposalComp: "BSR",
        },
      ],
    },
  };
}

function brPublicResponse(date = "2099-06-10") {
  return {
    dates: [{ date, fraction: "Papier" }],
  };
}

function loadHelper() {
  const source = fs.readFileSync(NODE_HELPER_FILE, "utf8");
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "node_helper") {
      return { create: (definition) => definition };
    }
    return requireFromNodeHelper(request);
  };
  const wrapped = `(function (require, module, exports, __dirname, __filename) { ${source}\n})`;
  const script = new vm.Script(wrapped, { filename: NODE_HELPER_FILE });
  const fn = script.runInThisContext();
  fn(localRequire, module, module.exports, path.dirname(NODE_HELPER_FILE), NODE_HELPER_FILE);
  return module.exports;
}

function setupHelper({ executeApiCall }) {
  const helper = loadHelper();
  const notifications = [];
  helper.sendSocketNotification = (notification, payload) => {
    notifications.push({ notification, payload });
  };
  helper.executeApiCall = executeApiCall;
  helper.loadCache = () => null;
  helper.saveCache = vi.fn();
  helper.scheduleUpdate = vi.fn();
  helper.scheduleRetry = vi.fn();
  helper.start();
  return { helper, notifications };
}

describe("Berlin Recycling node_helper orchestration", () => {
  const originalUsername = process.env.BERLIN_RECYCLING_USERNAME;
  const originalPassword = process.env.BERLIN_RECYCLING_PASSWORD;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.BERLIN_RECYCLING_USERNAME = originalUsername;
    process.env.BERLIN_RECYCLING_PASSWORD = originalPassword;
    vi.restoreAllMocks();
  });

  it("merges BSR and Berlin Recycling public dates", async () => {
    process.env.BERLIN_RECYCLING_USERNAME = "";
    process.env.BERLIN_RECYCLING_PASSWORD = "";
    const executeApiCall = vi
      .fn()
      .mockResolvedValueOnce(bsrAddressResponse())
      .mockResolvedValueOnce(bsrCalendarResponse("2099-06-15"))
      .mockResolvedValueOnce({ dates: {} })
      .mockResolvedValueOnce(brPublicResponse("2099-06-10"));
    const { helper, notifications } = setupHelper({ executeApiCall });

    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    const data = notifications.find((n) => n.notification === "BSR_PICKUP_DATA")?.payload.dates;
    expect(data.map((date) => date.category)).toEqual(["PP", "HM"]);
    expect(data.map((date) => date.disposalCompany)).toContain("Berlin Recycling");
  });

  it("falls back to public provider when portal credentials are missing", async () => {
    process.env.BERLIN_RECYCLING_USERNAME = "";
    process.env.BERLIN_RECYCLING_PASSWORD = "";
    const executeApiCall = vi
      .fn()
      .mockResolvedValueOnce(bsrAddressResponse())
      .mockResolvedValueOnce(bsrCalendarResponse())
      .mockResolvedValueOnce({ dates: {} })
      .mockResolvedValueOnce(brPublicResponse());
    const { helper, notifications } = setupHelper({ executeApiCall });

    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    expect(executeApiCall).toHaveBeenCalledTimes(4);
    expect(notifications.some((n) => n.notification === "BSR_ERROR")).toBe(false);
    expect(notifications.at(-1).payload.dates.some((date) => date.category === "PP")).toBe(true);
  });

  it("keeps BSR output when Berlin Recycling fails", async () => {
    process.env.BERLIN_RECYCLING_USERNAME = "";
    process.env.BERLIN_RECYCLING_PASSWORD = "";
    const executeApiCall = vi
      .fn()
      .mockResolvedValueOnce(bsrAddressResponse())
      .mockResolvedValueOnce(bsrCalendarResponse("2099-06-15"))
      .mockResolvedValueOnce({ dates: {} })
      .mockRejectedValueOnce(new Error("BR down"));
    const { helper, notifications } = setupHelper({ executeApiCall });

    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    const data = notifications.find((n) => n.notification === "BSR_PICKUP_DATA")?.payload.dates;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ category: "HM", disposalCompany: "BSR" });
    expect(notifications.some((n) => n.notification === "BSR_ERROR")).toBe(false);
  });
});
