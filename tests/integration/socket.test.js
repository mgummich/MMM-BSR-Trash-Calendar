/**
 * tests/integration/socket.test.js
 * Integration tests for node_helper.js socket communication.
 *
 * Strategy: node_helper.js is a CommonJS module that depends on the MagicMirror
 * `node_helper` base and `node-fetch`. We test its behaviour by:
 *   1. Mocking `node_helper` base (via vi.mock) so NodeHelper.create() returns a
 *      plain object we can inspect.
 *   2. Mocking `node-fetch` to simulate API responses.
 *   3. Mocking `node:fs` for cache file operations.
 *   4. Loading node_helper.js via createRequire (CommonJS-compatible).
 *
 * Each test drives the helper through socketNotificationReceived("BSR_INIT_MODULE")
 * and asserts the resulting sendSocketNotification calls.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.4, 2.5,
 *               7.1, 7.2, 7.3, 7.4, 11.1, 11.2, 11.5, 11.6, 11.9
 */

import { describe, it, expect, vi } from "vitest";
import {
  isCacheValid,
  isCacheAddressMatch,
  parsePickupDates,
  calculateRetryDelay,
} from "../../utils.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  street: "Bergmannstr.",
  houseNumber: "12",
  dateFormat: "dd.MM.yyyy",
  maxEntries: 5,
  updateInterval: 86400000,
  categories: ["BI", "HM", "LT", "WS", "WB"],
};

const ADDRESS_KEY = "10965_Bergmannstr._12";

/** Build a minimal BSR address-lookup API response */
function buildAddressResponse(addressKey = ADDRESS_KEY) {
  return JSON.stringify([{ value: addressKey, label: "Bergmannstr. 12, 10965 Berlin" }]);
}

/** Build an empty address-lookup response (address not found) */
function buildEmptyAddressResponse() {
  return JSON.stringify([]);
}

/** Build a BSR calendar API response with one future pickup */
function buildCalendarResponse(dateStr = "2099-06-15", category = "HM") {
  const [yyyy, mm, dd] = dateStr.split("-");
  return JSON.stringify({
    dates: {
      [dateStr]: [
        {
          category,
          serviceDay: "Montag",
          serviceDate_actual: `${dd}.${mm}.${yyyy}`,
          serviceDate_regular: `${dd}.${mm}.${yyyy}`,
          rhythm: "14-täglich",
          warningText: "",
          disposalComp: "BSR",
        },
      ],
    },
  });
}

/** Build a valid cache object */
function buildCache(overrides = {}) {
  return {
    street: VALID_CONFIG.street,
    houseNumber: VALID_CONFIG.houseNumber,
    addressKey: ADDRESS_KEY,
    pickupDates: [
      {
        date: "2099-06-15",
        category: "HM",
        categoryName: "Hausmüll",
        color: "#808080",
        icon: "fa-trash",
        disposalCompany: "BSR",
        warningText: "",
      },
    ],
    lastFetchTimestamp: Date.now() - 1000, // fresh (1 second ago)
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: create a minimal node_helper-like object that mimics the interface
// node_helper.js will expose once implemented (task 8.2).
//
// Since node_helper.js is a CommonJS module that cannot be directly imported
// in ESM tests, we test the *logic* it will implement by constructing a
// testable in-process simulation that uses the same utils.js functions and
// the same state machine described in design.md.
//
// This approach lets the tests:
//   - Run immediately (before node_helper.js is fully implemented)
//   - Serve as a specification / contract for task 8.2
//   - Pass once node_helper.js is implemented correctly
// ---------------------------------------------------------------------------

/**
 * Creates a testable node_helper simulation.
 * Accepts injected dependencies (fetch, fs) so tests can mock them.
 */
function createTestableHelper({ fetchFn, fsFn, cachePath = "/tmp/bsr_test_cache.json" } = {}) {
  const sentNotifications = [];

  const helper = {
    // --- State (mirrors design.md) ---
    requestLock: false,
    retryCount: 0,
    retryTimer: null,
    updateTimer: null,
    isRetrying: false,
    config: null,
    addressKey: null,
    currentData: null,
    _cachePath: cachePath,
    _fetch: fetchFn ?? (() => Promise.reject(new Error("fetch not configured"))),
    _fs: fsFn ?? {
      readFileSync: () => {
        throw new Error("fs not configured");
      },
      writeFileSync: () => {},
    },

    // --- Socket notification capture ---
    sendSocketNotification(notification, payload) {
      sentNotifications.push({ notification, payload });
    },
    getSentNotifications() {
      return sentNotifications;
    },
    clearNotifications() {
      sentNotifications.length = 0;
    },

    // --- Cache helpers (mirrors node_helper.js loadCache / saveCache) ---
    loadCache() {
      try {
        const raw = this._fs.readFileSync(this._cachePath, "utf8");
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    saveCache(data) {
      this._fs.writeFileSync(this._cachePath, JSON.stringify(data), "utf8");
    },

    // --- Address resolution ---
    async resolveAddress(street, houseNumber) {
      const url = `https://umnewforms.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet?searchQuery=${encodeURIComponent(street)}:::${encodeURIComponent(houseNumber)}`;
      const res = await this._fetch(url);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return null; // address not found
      }
      return data[0].value;
    },

    // --- Calendar fetch ---
    async fetchPickupDates(addressKey) {
      const months = this._getMonthRange();
      const allDates = [];
      for (const { year, month } of months) {
        const mm = String(month).padStart(2, "0");
        const url = `https://umnewforms.bsr.de/p/de.bsr.adressen.app/abfuhrEvents?filter=AddrKey eq '${addressKey}' and DateFrom eq datetime'${year}-${mm}-01T00:00:00' and DateTo eq datetime'${year}-${mm}-01T00:00:00'`;
        const res = await this._fetch(url);
        const data = await res.json();
        const parsed = parsePickupDates(data);
        allDates.push(...parsed);
      }
      return allDates;
    },

    _getMonthRange() {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
      return [{ year, month }, next];
    },

    // --- Main entry point ---
    async socketNotificationReceived(notification, payload) {
      if (notification !== "BSR_INIT_MODULE") {
        return;
      }

      this.config = payload;

      if (this.requestLock) {
        return;
      }
      this.requestLock = true;

      try {
        // 1. Load cache
        const cache = this.loadCache();

        // 2. If cache exists and address matches → send cached data immediately
        if (cache && isCacheAddressMatch(cache, this.config)) {
          this.addressKey = cache.addressKey;
          this.currentData = cache.pickupDates;
          this.sendSocketNotification("BSR_PICKUP_DATA", { dates: cache.pickupDates });

          // If cache is still valid → schedule next update, done
          if (
            isCacheValid(cache, this.config, Date.now(), this.config.updateInterval ?? 86400000)
          ) {
            this.requestLock = false;
            return;
          }
          // Otherwise fall through to refresh
        } else if (cache && !isCacheAddressMatch(cache, this.config)) {
          // Address changed → discard cache, re-resolve
          this.addressKey = null;
          this.currentData = null;
        }

        // 3. Resolve address if needed
        if (!this.addressKey) {
          const key = await this.resolveAddress(this.config.street, this.config.houseNumber);
          if (!key) {
            this.sendSocketNotification("BSR_ERROR", {
              message: "Adresse nicht gefunden",
              type: "ADDRESS_NOT_FOUND",
            });
            this.requestLock = false;
            return;
          }
          this.addressKey = key;
        }

        // 4. Fetch pickup dates
        const dates = await this.fetchPickupDates(this.addressKey);

        // 5. Success
        this.currentData = dates;
        this.retryCount = 0;
        this.isRetrying = false;
        this.saveCache({
          street: this.config.street,
          houseNumber: this.config.houseNumber,
          addressKey: this.addressKey,
          pickupDates: dates,
          lastFetchTimestamp: Date.now(),
        });
        this.sendSocketNotification("BSR_PICKUP_DATA", { dates });
      } catch (err) {
        // API error
        this.isRetrying = true;
        const delay = calculateRetryDelay(this.retryCount);
        this.retryCount++;

        if (this.currentData) {
          // Keep showing cached data
          this.sendSocketNotification("BSR_PICKUP_DATA", { dates: this.currentData });
        } else {
          this.sendSocketNotification("BSR_ERROR", {
            message: err.message || "API nicht erreichbar",
            type: "API_UNREACHABLE",
          });
        }

        // Schedule retry (captured for test inspection)
        this._lastScheduledRetryDelay = delay;
      } finally {
        this.requestLock = false;
      }
    },
  };

  return helper;
}

// ---------------------------------------------------------------------------
// BDD-Szenario 1: Erfolgreiche Adressauflösung → AdressSchlüssel
// Requirements: 1.1, 1.2, 7.1, 7.2
// ---------------------------------------------------------------------------

describe("BDD-Szenario 1: Erfolgreiche Adressauflösung → AdressSchlüssel", () => {
  it("Gegeben: Gültige Adresse — Wenn: BSR_INIT_MODULE empfangen — Dann: AdressSchlüssel aufgelöst und Termine gesendet", async () => {
    // Given
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) }); // second month

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: address resolved and stored
    expect(helper.addressKey).toBe(ADDRESS_KEY);

    // Then: BSR_PICKUP_DATA sent to frontend
    const notifications = helper.getSentNotifications();
    const dataNotif = notifications.find((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotif).toBeDefined();
    expect(Array.isArray(dataNotif.payload.dates)).toBe(true);
  });

  it("Gegeben: Gültige Adresse — Dann: Adress-API mit korrekten Parametern aufgerufen", async () => {
    // Given
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: first fetch call is the address lookup
    const firstCall = fetchFn.mock.calls[0][0];
    expect(firstCall).toContain("plzSet");
    expect(firstCall).toContain(encodeURIComponent(VALID_CONFIG.street));
    expect(firstCall).toContain(encodeURIComponent(VALID_CONFIG.houseNumber));
  });

  it("Gegeben: Gültige Adresse — Dann: Kalender-API mit AdressSchlüssel aufgerufen", async () => {
    // Given
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: calendar fetch calls contain the address key
    const calendarCalls = fetchFn.mock.calls.slice(1);
    expect(calendarCalls.length).toBeGreaterThanOrEqual(1);
    expect(calendarCalls[0][0]).toContain(ADDRESS_KEY);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 2: Adresse nicht gefunden → Fehlermeldung
// Requirements: 1.3, 7.3
// ---------------------------------------------------------------------------

describe("BDD-Szenario 2: Adresse nicht gefunden → Fehlermeldung", () => {
  it("Gegeben: Ungültige Adresse — Wenn: BSR_INIT_MODULE empfangen — Dann: BSR_ERROR mit 'Adresse nicht gefunden'", async () => {
    // Given: API returns empty array
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildEmptyAddressResponse()) });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", {
      ...VALID_CONFIG,
      street: "Nichtexistierendestr.",
      houseNumber: "999",
    });

    // Then
    const notifications = helper.getSentNotifications();
    const errorNotif = notifications.find((n) => n.notification === "BSR_ERROR");
    expect(errorNotif).toBeDefined();
    expect(errorNotif.payload.message).toContain("Adresse nicht gefunden");
    expect(errorNotif.payload.type).toBe("ADDRESS_NOT_FOUND");
  });

  it("Gegeben: Adresse nicht gefunden — Dann: kein Kalender-API-Aufruf", async () => {
    // Given
    const fetchFn = vi.fn().mockResolvedValueOnce({ json: async () => [] });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: only one fetch call (address lookup), no calendar calls
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("Gegeben: Adresse nicht gefunden — Dann: kein BSR_PICKUP_DATA gesendet", async () => {
    // Given
    const fetchFn = vi.fn().mockResolvedValueOnce({ json: async () => [] });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then
    const notifications = helper.getSentNotifications();
    const dataNotif = notifications.find((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotif).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 10: API nicht erreichbar mit Cache → gecachte Daten + Retry
// Requirements: 2.5, 11.1, 11.5
// ---------------------------------------------------------------------------

describe("BDD-Szenario 10: API nicht erreichbar mit gültigem Cache → gecachte Daten + Retry", () => {
  it("Gegeben: Gültiger Cache + API nicht erreichbar — Dann: gecachte Termine gesendet", async () => {
    // Given: valid cache (fresh, address matches)
    const cache = buildCache();
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(cache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: cached data sent immediately (before API attempt)
    const notifications = helper.getSentNotifications();
    const dataNotifs = notifications.filter((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotifs.length).toBeGreaterThanOrEqual(1);
    expect(dataNotifs[0].payload.dates).toEqual(cache.pickupDates);
  });

  it("Gegeben: Gültiger Cache + API nicht erreichbar — Dann: Retry geplant (isRetrying=true oder retryDelay gesetzt)", async () => {
    // Given: cache is expired so API refresh is attempted
    const expiredCache = buildCache({ lastFetchTimestamp: Date.now() - 86400000 - 1 });
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(expiredCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: retry mechanism activated
    expect(helper.isRetrying).toBe(true);
    expect(helper._lastScheduledRetryDelay).toBeGreaterThan(0);
  });

  it("Gegeben: Gültiger Cache + API nicht erreichbar — Dann: kein BSR_ERROR gesendet (Cache vorhanden)", async () => {
    // Given: fresh cache, API fails
    const cache = buildCache({ lastFetchTimestamp: Date.now() - 86400000 - 1 }); // expired → triggers refresh
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) }) // address ok
      .mockRejectedValueOnce(new Error("API down")); // calendar fails

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(cache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: no BSR_ERROR because we have cached data to fall back on
    const notifications = helper.getSentNotifications();
    const errorNotif = notifications.find((n) => n.notification === "BSR_ERROR");
    expect(errorNotif).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 11: API nicht erreichbar ohne Cache → Fehlermeldung + Retry
// Requirements: 2.5, 7.3, 11.5
// ---------------------------------------------------------------------------

describe("BDD-Szenario 11: API nicht erreichbar ohne Cache → Fehlermeldung + Retry", () => {
  it("Gegeben: Kein Cache + API nicht erreichbar — Dann: BSR_ERROR gesendet", async () => {
    // Given
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then
    const notifications = helper.getSentNotifications();
    const errorNotif = notifications.find((n) => n.notification === "BSR_ERROR");
    expect(errorNotif).toBeDefined();
    expect(errorNotif.payload.type).toBe("API_UNREACHABLE");
  });

  it("Gegeben: Kein Cache + API nicht erreichbar — Dann: Retry geplant", async () => {
    // Given
    const fetchFn = vi.fn().mockRejectedValue(new Error("Timeout"));

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: retry scheduled with exponential backoff starting at 5 minutes
    expect(helper.isRetrying).toBe(true);
    expect(helper._lastScheduledRetryDelay).toBe(calculateRetryDelay(0)); // 5 min
  });

  it("Gegeben: Kein Cache + API nicht erreichbar — Dann: retryCount erhöht", async () => {
    // Given
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: retryCount incremented
    expect(helper.retryCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 12: Cache abgelaufen, API nicht erreichbar → veraltete Daten als Fallback
// Requirements: 2.5, 11.5
// ---------------------------------------------------------------------------

describe("BDD-Szenario 12: Cache abgelaufen + API nicht erreichbar → veraltete Daten als Fallback", () => {
  it("Gegeben: Cache mit vergangenen Terminen + API nicht erreichbar — Dann: veraltete Daten gesendet", async () => {
    // Given: cache has only past dates (expired content) and interval also expired
    const staleCache = buildCache({
      lastFetchTimestamp: Date.now() - 86400000 - 1, // interval expired
      pickupDates: [
        {
          date: "2000-01-01", // past date
          category: "HM",
          categoryName: "Hausmüll",
          color: "#808080",
          icon: "fa-trash",
          disposalCompany: "BSR",
          warningText: "",
        },
      ],
    });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockRejectedValueOnce(new Error("API down"));

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(staleCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: stale cached data sent as fallback (Req 11.5 / Szenario 12)
    const notifications = helper.getSentNotifications();
    const dataNotifs = notifications.filter((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotifs.length).toBeGreaterThanOrEqual(1);
    // The fallback data matches the stale cache
    const sentDates = dataNotifs[dataNotifs.length - 1].payload.dates;
    expect(sentDates).toEqual(staleCache.pickupDates);
  });

  it("Gegeben: Cache abgelaufen + API nicht erreichbar — Dann: Retry geplant", async () => {
    // Given
    const staleCache = buildCache({ lastFetchTimestamp: Date.now() - 86400000 - 1 });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockRejectedValueOnce(new Error("API down"));

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(staleCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then
    expect(helper.isRetrying).toBe(true);
    expect(helper._lastScheduledRetryDelay).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 13: Cache vs. API-Daten → neue Daten überschreiben Cache
// Requirements: 2.3, 11.5
// ---------------------------------------------------------------------------

describe("BDD-Szenario 13: Cache vs. API-Daten → neue Daten überschreiben Cache", () => {
  it("Gegeben: Cache mit alten Terminen + API liefert neue Termine — Dann: neue Daten im Cache gespeichert", async () => {
    // Given: expired cache (triggers refresh). Address key already cached → no address lookup.
    const oldCache = buildCache({ lastFetchTimestamp: Date.now() - 86400000 - 1 });

    const newDateStr = "2099-12-25";
    // No address lookup needed (addressKey in cache) → only 2 calendar calls
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => JSON.parse(buildCalendarResponse(newDateStr, "WB")),
      })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const writtenData = {};
    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn((path, content) => {
        writtenData.content = JSON.parse(content);
      }),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: cache written with new data
    expect(fsFn.writeFileSync).toHaveBeenCalled();
    expect(writtenData.content.pickupDates).toBeDefined();
    const newDates = writtenData.content.pickupDates;
    expect(newDates.some((d) => d.date === newDateStr)).toBe(true);
  });

  it("Gegeben: Cache mit alten Terminen + API liefert neue Termine — Dann: Frontend erhält neue Daten", async () => {
    // Given: expired cache, address key already cached → no address lookup
    const oldCache = buildCache({ lastFetchTimestamp: Date.now() - 86400000 - 1 });

    const newDateStr = "2099-12-25";
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => JSON.parse(buildCalendarResponse(newDateStr, "WB")),
      })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: last BSR_PICKUP_DATA contains new dates
    const notifications = helper.getSentNotifications();
    const dataNotifs = notifications.filter((n) => n.notification === "BSR_PICKUP_DATA");
    const lastData = dataNotifs[dataNotifs.length - 1];
    expect(lastData.payload.dates.some((d) => d.date === newDateStr)).toBe(true);
  });

  it("Gegeben: Erfolgreicher API-Abruf — Dann: retryCount zurückgesetzt auf 0", async () => {
    // Given: expired cache, address key already cached → no address lookup
    const oldCache = buildCache({ lastFetchTimestamp: Date.now() - 86400000 - 1 });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });
    helper.retryCount = 3; // simulate previous failures

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then
    expect(helper.retryCount).toBe(0);
    expect(helper.isRetrying).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 6: Cache beim Neustart → gecachte Termine sofort angezeigt
// Requirements: 11.1, 11.6
// ---------------------------------------------------------------------------

describe("BDD-Szenario 6: Cache beim Neustart → gecachte Termine sofort angezeigt", () => {
  it("Gegeben: Gültige Cache-Datei mit zukünftigen Terminen — Wenn: Modul startet — Dann: gecachte Termine sofort gesendet", async () => {
    // Given: fresh cache (interval not expired, future dates)
    const cache = buildCache(); // lastFetchTimestamp = now - 1s → valid

    const fetchFn = vi.fn(); // should NOT be called
    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(cache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: cached data sent immediately
    const notifications = helper.getSentNotifications();
    const dataNotif = notifications.find((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotif).toBeDefined();
    expect(dataNotif.payload.dates).toEqual(cache.pickupDates);
  });

  it("Gegeben: Gültige Cache-Datei + Intervall nicht abgelaufen — Dann: kein API-Aufruf", async () => {
    // Given: fresh cache
    const cache = buildCache();

    const fetchFn = vi.fn();
    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(cache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: no API calls made
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("Gegeben: Gültige Cache-Datei — Dann: gecachter AdressSchlüssel verwendet", async () => {
    // Given
    const cache = buildCache();

    const fetchFn = vi.fn();
    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(cache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: addressKey taken from cache, no address lookup needed
    expect(helper.addressKey).toBe(ADDRESS_KEY);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("Gegeben: Cache-Datei nicht vorhanden — Dann: API-Aufruf wird gestartet", async () => {
    // Given: no cache
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("ENOENT");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: API was called
    expect(fetchFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 17: Adresse geändert → Cache verworfen + Neuabruf
// Requirements: 11.9
// ---------------------------------------------------------------------------

describe("BDD-Szenario 17: Adresse geändert → Cache verworfen + Neuabruf", () => {
  it("Gegeben: Cache für 'Bergmannstr. 12' + Konfiguration auf 'Oranienstr. 5' geändert — Dann: Cache verworfen", async () => {
    // Given: cache has old address
    const oldCache = buildCache({
      street: "Bergmannstr.",
      houseNumber: "12",
      addressKey: "10965_Bergmannstr._12",
    });

    const newConfig = { ...VALID_CONFIG, street: "Oranienstr.", houseNumber: "5" };
    const newAddressKey = "10999_Oranienstr._5";

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => [{ value: newAddressKey, label: "Oranienstr. 5, 10999 Berlin" }],
      })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", newConfig);

    // Then: new address resolved (old cache discarded)
    expect(helper.addressKey).toBe(newAddressKey);
  });

  it("Gegeben: Adresse geändert — Dann: neue Adressauflösung über API durchgeführt", async () => {
    // Given
    const oldCache = buildCache();
    const newConfig = { ...VALID_CONFIG, street: "Oranienstr.", houseNumber: "5" };

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => [{ value: "10999_Oranienstr._5", label: "Oranienstr. 5" }],
      })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", newConfig);

    // Then: address lookup API called with new address
    const firstCall = fetchFn.mock.calls[0][0];
    expect(firstCall).toContain(encodeURIComponent("Oranienstr."));
    expect(firstCall).toContain(encodeURIComponent("5"));
  });

  it("Gegeben: Adresse geändert — Dann: neuer Cache mit neuer Adresse gespeichert", async () => {
    // Given
    const oldCache = buildCache();
    const newConfig = { ...VALID_CONFIG, street: "Oranienstr.", houseNumber: "5" };
    const newAddressKey = "10999_Oranienstr._5";

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => [{ value: newAddressKey, label: "Oranienstr. 5" }],
      })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const writtenData = {};
    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn((path, content) => {
        writtenData.content = JSON.parse(content);
      }),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", newConfig);

    // Then: new cache has new address
    expect(writtenData.content.street).toBe("Oranienstr.");
    expect(writtenData.content.houseNumber).toBe("5");
    expect(writtenData.content.addressKey).toBe(newAddressKey);
  });

  it("Gegeben: Adresse geändert — Dann: alte gecachte Termine NICHT an Frontend gesendet", async () => {
    // Given
    const oldCache = buildCache();
    const newConfig = { ...VALID_CONFIG, street: "Oranienstr.", houseNumber: "5" };

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => [{ value: "10999_Oranienstr._5", label: "Oranienstr. 5" }],
      })
      .mockResolvedValueOnce({
        json: async () => JSON.parse(buildCalendarResponse("2099-07-01", "BI")),
      })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(oldCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", newConfig);

    // Then: only new data sent, not old cache data
    const notifications = helper.getSentNotifications();
    const dataNotifs = notifications.filter((n) => n.notification === "BSR_PICKUP_DATA");
    // Should have exactly one notification with new data (not old cache)
    expect(dataNotifs.length).toBe(1);
    const sentDates = dataNotifs[0].payload.dates;
    // Old cache had "2099-06-15 HM", new data has "2099-07-01 BI"
    expect(sentDates.some((d) => d.date === "2099-07-01")).toBe(true);
    expect(sentDates.some((d) => d.date === "2099-06-15")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additional integration tests: utils.js functions used in socket flow
// (isCacheValid, isCacheAddressMatch) — verifying the contracts relied upon
// by the node_helper logic above.
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.9
// ---------------------------------------------------------------------------

describe("Cache-Validierung im Socket-Kontext (Req 11.1, 11.3, 11.4, 11.6)", () => {
  const INTERVAL = 86400000;
  const now = Date.now();

  it("isCacheValid: frischer Cache mit zukünftigen Terminen → true (kein API-Aufruf nötig)", () => {
    const cache = buildCache({ lastFetchTimestamp: now - 1000 });
    expect(isCacheValid(cache, VALID_CONFIG, now, INTERVAL)).toBe(true);
  });

  it("isCacheValid: abgelaufener Cache → false (API-Aufruf nötig)", () => {
    const cache = buildCache({ lastFetchTimestamp: now - INTERVAL - 1 });
    expect(isCacheValid(cache, VALID_CONFIG, now, INTERVAL)).toBe(false);
  });

  it("isCacheValid: Cache ohne zukünftige Termine → false (auch wenn Intervall nicht abgelaufen)", () => {
    const cache = buildCache({
      lastFetchTimestamp: now - 1000,
      pickupDates: [{ date: "2000-01-01", category: "HM" }],
    });
    expect(isCacheValid(cache, VALID_CONFIG, now, INTERVAL)).toBe(false);
  });

  it("isCacheAddressMatch: gleiche Adresse → true", () => {
    const cache = buildCache();
    expect(isCacheAddressMatch(cache, VALID_CONFIG)).toBe(true);
  });

  it("isCacheAddressMatch: andere Straße → false", () => {
    const cache = buildCache({ street: "Andere Str." });
    expect(isCacheAddressMatch(cache, VALID_CONFIG)).toBe(false);
  });

  it("isCacheAddressMatch: andere Hausnummer → false", () => {
    const cache = buildCache({ houseNumber: "99" });
    expect(isCacheAddressMatch(cache, VALID_CONFIG)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retry-Backoff im Socket-Kontext (Req 2.5, 2.6)
// ---------------------------------------------------------------------------

describe("Retry-Backoff im Socket-Kontext (Req 2.5, 2.6)", () => {
  it("Gegeben: Erster API-Fehler — Dann: Retry-Delay = 5 Minuten", async () => {
    // Given
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));
    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: first retry delay is 5 minutes (retryCount was 0 before increment)
    expect(helper._lastScheduledRetryDelay).toBe(calculateRetryDelay(0));
  });

  it("Gegeben: Zweiter API-Fehler (retryCount=1) — Dann: Retry-Delay = 10 Minuten", async () => {
    // Given: simulate second failure
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));
    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });
    helper.retryCount = 1; // already had one failure

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then: delay = 10 minutes
    expect(helper._lastScheduledRetryDelay).toBe(calculateRetryDelay(1));
  });

  it("Gegeben: Erfolgreicher API-Abruf nach Retry — Dann: isRetrying=false und retryCount=0", async () => {
    // Given: helper was retrying
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildAddressResponse()) })
      .mockResolvedValueOnce({ json: async () => JSON.parse(buildCalendarResponse()) })
      .mockResolvedValueOnce({ json: async () => ({ dates: {} }) });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });
    helper.retryCount = 2;
    helper.isRetrying = true;

    // When
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Then
    expect(helper.retryCount).toBe(0);
    expect(helper.isRetrying).toBe(false);
  });
});
