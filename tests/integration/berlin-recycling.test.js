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
    usePublicFallback: false,
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
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.BERLIN_RECYCLING_USERNAME = originalUsername;
    process.env.BERLIN_RECYCLING_PASSWORD = originalPassword;
    vi.restoreAllMocks();
  });

  it("keeps BSR output when Berlin Recycling portal credentials are missing", async () => {
    process.env.BERLIN_RECYCLING_USERNAME = "";
    process.env.BERLIN_RECYCLING_PASSWORD = "";
    const executeApiCall = vi
      .fn()
      .mockResolvedValueOnce(bsrAddressResponse())
      .mockResolvedValueOnce(bsrCalendarResponse("2099-06-15"))
      .mockResolvedValueOnce({ dates: {} });
    const { helper, notifications } = setupHelper({ executeApiCall });

    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    const data = notifications.find((n) => n.notification === "BSR_PICKUP_DATA")?.payload.dates;
    expect(executeApiCall).toHaveBeenCalledTimes(3);
    expect(notifications.some((n) => n.notification === "BSR_ERROR")).toBe(false);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ category: "HM", disposalCompany: "BSR" });
  });

  it("keeps BSR output when explicit Berlin Recycling public fallback is unsupported", async () => {
    process.env.BERLIN_RECYCLING_USERNAME = "";
    process.env.BERLIN_RECYCLING_PASSWORD = "";
    const executeApiCall = vi
      .fn()
      .mockResolvedValueOnce(bsrAddressResponse())
      .mockResolvedValueOnce(bsrCalendarResponse("2099-06-15"))
      .mockResolvedValueOnce({ dates: {} });
    const { helper, notifications } = setupHelper({ executeApiCall });

    await helper.socketNotificationReceived("BSR_INIT_MODULE", {
      ...VALID_CONFIG,
      berlinRecycling: { enabled: true, usePortal: true, usePublicFallback: true },
    });

    const data = notifications.find((n) => n.notification === "BSR_PICKUP_DATA")?.payload.dates;
    expect(executeApiCall).toHaveBeenCalledTimes(3);
    expect(notifications.some((n) => n.notification === "BSR_ERROR")).toBe(false);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ category: "HM", disposalCompany: "BSR" });
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

  it("writes detailed debug logs when debug config is enabled", async () => {
    process.env.BERLIN_RECYCLING_USERNAME = "";
    process.env.BERLIN_RECYCLING_PASSWORD = "";
    const executeApiCall = vi
      .fn()
      .mockResolvedValueOnce(bsrAddressResponse())
      .mockResolvedValueOnce(bsrCalendarResponse())
      .mockResolvedValueOnce({ dates: {} });
    const { helper } = setupHelper({ executeApiCall });

    await helper.socketNotificationReceived("BSR_INIT_MODULE", {
      ...VALID_CONFIG,
      debug: true,
    });

    const debugMessages = console.log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(debugMessages).toContain("DEBUG Config accepted");
    expect(debugMessages).toContain("DEBUG Fetching BSR pickup dates");
    expect(debugMessages).toContain("DEBUG Merged and filtered");
  });
});
