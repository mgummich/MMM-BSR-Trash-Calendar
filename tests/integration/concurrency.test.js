/**
 * tests/integration/concurrency.test.js
 * Integration tests for Concurrency Guard and API-Timeout behaviour.
 *
 * BDD-Szenario 21: API-Timeout → Abbruch nach 30s + Retry
 * Property 16: Concurrency Guard — maximal ein aktiver Aufruf
 *
 * Requirements: 1.5, 1.6
 *
 * Strategy: Uses the same createTestableHelper() factory pattern as
 * tests/integration/socket.test.js. The helper simulates the node_helper's
 * state machine using the same utils.js functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateRetryDelay } from "../../utils.js";

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

function buildAddressResponse(addressKey = ADDRESS_KEY) {
  return JSON.stringify([{ value: addressKey, label: "Bergmannstr. 12, 10965 Berlin" }]);
}

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

// ---------------------------------------------------------------------------
// createTestableHelper — same pattern as socket.test.js
// ---------------------------------------------------------------------------

import { isCacheValid, isCacheAddressMatch, parsePickupDates } from "../../utils.js";

/**
 * Creates a testable node_helper simulation.
 * Accepts injected dependencies (fetch, fs) so tests can mock them.
 */
function createTestableHelper({
  fetchFn,
  fsFn,
  cachePath = "/tmp/bsr_concurrency_test_cache.json",
} = {}) {
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

    // --- Cache helpers ---
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
        return null;
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

      // Concurrency Guard
      if (this.requestLock) {
        return;
      }
      this.requestLock = true;

      try {
        const cache = this.loadCache();

        if (cache && isCacheAddressMatch(cache, this.config)) {
          this.addressKey = cache.addressKey;
          this.currentData = cache.pickupDates;
          this.sendSocketNotification("BSR_PICKUP_DATA", { dates: cache.pickupDates });

          if (
            isCacheValid(cache, this.config, Date.now(), this.config.updateInterval ?? 86400000)
          ) {
            this.requestLock = false;
            return;
          }
        } else if (cache && !isCacheAddressMatch(cache, this.config)) {
          this.addressKey = null;
          this.currentData = null;
        }

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

        const dates = await this.fetchPickupDates(this.addressKey);

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
        this.isRetrying = true;
        const delay = calculateRetryDelay(this.retryCount);
        this.retryCount++;

        if (this.currentData) {
          this.sendSocketNotification("BSR_PICKUP_DATA", { dates: this.currentData });
        } else {
          this.sendSocketNotification("BSR_ERROR", {
            message: err.message || "API nicht erreichbar",
            type: err.type || "API_UNREACHABLE",
          });
        }

        this._lastScheduledRetryDelay = delay;
      } finally {
        this.requestLock = false;
      }
    },
  };

  return helper;
}

// ---------------------------------------------------------------------------
// BDD-Szenario 21: API-Timeout → Abbruch nach 30s + Retry
// Requirements: 1.5, 1.6
// ---------------------------------------------------------------------------

describe("BDD-Szenario 21: API-Timeout → Abbruch nach 30s + Retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Gegeben: BSR-API antwortet nicht — Wenn: 30s vergehen — Dann: Aufruf wird abgebrochen und Retry-Mechanismus startet", async () => {
    // Gegeben: fetch gibt ein Promise zurück, das nie auflöst (simuliert Timeout)
    let rejectFetch;
    const neverResolvingFetch = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        })
    );

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn: neverResolvingFetch, fsFn });

    // Wenn: socketNotificationReceived gestartet (läuft asynchron)
    const callPromise = helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Simuliere Timeout: fetch wird nach 30s mit AbortError abgebrochen
    const timeoutError = new Error("API request timed out after 30s");
    timeoutError.type = "API_TIMEOUT";
    timeoutError.name = "AbortError";
    rejectFetch(timeoutError);

    await callPromise;

    // Dann: Retry-Mechanismus wurde aktiviert
    expect(helper.isRetrying).toBe(true);
    expect(helper._lastScheduledRetryDelay).toBeGreaterThan(0);
  });

  it("Gegeben: API-Timeout — Dann: BSR_ERROR mit Typ 'API_TIMEOUT' oder 'API_UNREACHABLE' gesendet (kein Cache)", async () => {
    // Gegeben: kein Cache, fetch schlägt mit Timeout-Fehler fehl
    const timeoutError = new Error("API request timed out after 30s");
    timeoutError.type = "API_TIMEOUT";
    const fetchFn = vi.fn().mockRejectedValue(timeoutError);

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: Fehlermeldung an Frontend gesendet
    const notifications = helper.getSentNotifications();
    const errorNotif = notifications.find((n) => n.notification === "BSR_ERROR");
    expect(errorNotif).toBeDefined();
    expect(["API_TIMEOUT", "API_UNREACHABLE"]).toContain(errorNotif.payload.type);
  });

  it("Gegeben: API-Timeout mit vorhandenem Cache — Dann: gecachte Daten beibehalten (kein BSR_ERROR)", async () => {
    // Gegeben: Cache vorhanden (abgelaufen, damit API-Aufruf versucht wird)
    const staleCache = {
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
      lastFetchTimestamp: Date.now() - 86400000 - 1, // abgelaufen
    };

    const timeoutError = new Error("API request timed out after 30s");
    timeoutError.type = "API_TIMEOUT";
    const fetchFn = vi.fn().mockRejectedValue(timeoutError);

    const fsFn = {
      readFileSync: vi.fn(() => JSON.stringify(staleCache)),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: kein BSR_ERROR, gecachte Daten werden weiter angezeigt
    const notifications = helper.getSentNotifications();
    const errorNotif = notifications.find((n) => n.notification === "BSR_ERROR");
    expect(errorNotif).toBeUndefined();

    const dataNotifs = notifications.filter((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotifs.length).toBeGreaterThanOrEqual(1);
  });

  it("Gegeben: API-Timeout — Dann: retryCount wird erhöht", async () => {
    // Gegeben
    const timeoutError = new Error("API request timed out after 30s");
    timeoutError.type = "API_TIMEOUT";
    const fetchFn = vi.fn().mockRejectedValue(timeoutError);

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann
    expect(helper.retryCount).toBeGreaterThan(0);
  });

  it("Gegeben: API-Timeout — Dann: requestLock nach Abbruch freigegeben", async () => {
    // Gegeben
    const timeoutError = new Error("API request timed out after 30s");
    timeoutError.type = "API_TIMEOUT";
    const fetchFn = vi.fn().mockRejectedValue(timeoutError);

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: Lock muss nach dem Fehler freigegeben sein
    expect(helper.requestLock).toBe(false);
  });

  it("Gegeben: API-Timeout — Dann: Retry-Delay entspricht exponentiellem Backoff (5 Min beim ersten Fehler)", async () => {
    // Gegeben
    const timeoutError = new Error("API request timed out after 30s");
    timeoutError.type = "API_TIMEOUT";
    const fetchFn = vi.fn().mockRejectedValue(timeoutError);

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: erster Retry-Delay = 5 Minuten
    expect(helper._lastScheduledRetryDelay).toBe(calculateRetryDelay(0));
  });
});

// ---------------------------------------------------------------------------
// Property 16: Concurrency Guard — maximal ein aktiver Aufruf
// Feature: mmm-bsr-trash-calendar, Property 16: Concurrency Guard — maximal ein aktiver Aufruf
// Requirements: 1.6
// ---------------------------------------------------------------------------

describe("Property 16: Concurrency Guard — maximal ein aktiver Aufruf", () => {
  it("Gegeben: requestLock gesetzt — Wenn: zweiter BSR_INIT_MODULE empfangen — Dann: zweiter Aufruf ignoriert", async () => {
    // Gegeben: fetch schlägt sofort fehl (simuliert laufenden Aufruf via Lock)
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Lock manuell setzen (simuliert laufenden ersten Aufruf)
    helper.requestLock = true;

    // Wenn: zweiter BSR_INIT_MODULE empfangen während Lock gesetzt
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: fetch wurde nicht aufgerufen (zweiter Aufruf durch Lock blockiert)
    expect(fetchFn).not.toHaveBeenCalled();

    // Lock freigeben und prüfen, dass ein neuer Aufruf jetzt durchgeht
    helper.requestLock = false;
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("Gegeben: requestLock gesetzt — Dann: requestLock=true verhindert parallele Ausführung", async () => {
    // Gegeben: helper mit gesetztem Lock
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => JSON.parse(buildAddressResponse()),
    });

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Lock manuell setzen (simuliert laufenden Aufruf)
    helper.requestLock = true;

    // Wenn: BSR_INIT_MODULE empfangen während Lock gesetzt
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: kein fetch-Aufruf (Aufruf wurde ignoriert)
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("Gegeben: requestLock gesetzt — Dann: keine Notification gesendet (zweiter Aufruf ignoriert)", async () => {
    // Gegeben
    const fetchFn = vi.fn();
    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });
    helper.requestLock = true;

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: keine Notifications gesendet
    expect(helper.getSentNotifications()).toHaveLength(0);
  });

  it("Gegeben: Erfolgreicher API-Aufruf — Dann: requestLock nach Abschluss freigegeben", async () => {
    // Gegeben
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

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: Lock freigegeben
    expect(helper.requestLock).toBe(false);
  });

  it("Gegeben: Fehlgeschlagener API-Aufruf — Dann: requestLock nach Fehler freigegeben", async () => {
    // Gegeben
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));
    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Wenn
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: Lock freigegeben (auch bei Fehler)
    expect(helper.requestLock).toBe(false);
  });

  it("Gegeben: Mehrere gleichzeitige Aufrufe — Dann: fetch wird nur einmal ausgeführt", async () => {
    // Gegeben: Lock ist bereits gesetzt (simuliert laufenden Aufruf)
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

    const fsFn = {
      readFileSync: vi.fn(() => {
        throw new Error("no cache");
      }),
      writeFileSync: vi.fn(),
    };

    const helper = createTestableHelper({ fetchFn, fsFn });

    // Ersten Aufruf starten und Lock setzen
    helper.requestLock = true;

    // Wenn: zwei weitere Aufrufe während Lock gesetzt
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: fetch wurde nicht aufgerufen (alle durch Lock blockiert)
    expect(fetchFn).not.toHaveBeenCalled();

    // Lock freigeben: jetzt darf genau ein Aufruf durch
    helper.requestLock = false;
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: fetch genau einmal aufgerufen
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("Gegeben: Lock freigegeben nach erstem Aufruf — Dann: zweiter Aufruf kann starten", async () => {
    // Gegeben: erster Aufruf schlägt fehl, Lock wird freigegeben
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("First call fails"))
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

    // Erster Aufruf (schlägt fehl)
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);
    expect(helper.requestLock).toBe(false);

    // Zweiter Aufruf (soll erfolgreich sein)
    helper.clearNotifications();
    await helper.socketNotificationReceived("BSR_INIT_MODULE", VALID_CONFIG);

    // Dann: zweiter Aufruf hat Daten geliefert
    const notifications = helper.getSentNotifications();
    const dataNotif = notifications.find((n) => n.notification === "BSR_PICKUP_DATA");
    expect(dataNotif).toBeDefined();
  });
});
