import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  parsePickupDates,
  sortByDate,
  getCategoryDisplay,
  filterByCategories,
  getRelativeLabel,
  CATEGORY_MAP,
  getCacheKey,
  isCacheValid,
  isCacheAddressMatch,
  loadCache,
  saveCache,
  sanitizeCategories,
} from "../../utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid BSR API response.
 * @param {Array<{date: string, category: string, disposalComp?: string, warningText?: string}>} entries
 */
function buildApiResponse(entries) {
  const dates = {};
  for (const { date, category, disposalComp = "BSR", warningText = "" } of entries) {
    if (!dates[date]) {
      dates[date] = [];
    }
    dates[date].push({
      category,
      serviceDay: "Montag",
      serviceDate_actual: formatToApiDate(date),
      serviceDate_regular: formatToApiDate(date),
      rhythm: "14-täglich",
      warningText,
      disposalComp,
    });
  }
  return { dates };
}

/** Convert ISO date "YYYY-MM-DD" → API format "dd.MM.yyyy" */
function formatToApiDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Use a fixed "today" in the future so all test dates are treated as upcoming.
const FAR_FUTURE_TODAY = "2000-01-01";

describe("Berlin Recycling categories", () => {
  it("supports Papier, Glas, and Gewerbeabfall display metadata", () => {
    expect(getCategoryDisplay("PP")).toMatchObject({ name: "Papier", icon: "fa-newspaper" });
    expect(getCategoryDisplay("GL")).toMatchObject({ name: "Glas", icon: "fa-wine-bottle" });
    expect(getCategoryDisplay("GW")).toMatchObject({
      name: "Gewerbeabfall",
      icon: "fa-dumpster",
    });
  });

  it("allows Berlin Recycling categories in category filtering", () => {
    expect(sanitizeCategories(["HM", "PP", "GL"])).toEqual(["HM", "PP", "GL"]);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 3: Termine aufsteigend sortiert
// ---------------------------------------------------------------------------

describe("BDD-Szenario 3: Abfuhrtermine werden aufsteigend nach Datum sortiert", () => {
  it("Gegeben: Mehrere Termine mit unterschiedlichen Daten — Dann: aufsteigend sortiert", () => {
    const response = buildApiResponse([
      { date: "2099-03-15", category: "HM" },
      { date: "2099-01-05", category: "BI" },
      { date: "2099-02-20", category: "WS" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2099-01-05");
    expect(result[1].date).toBe("2099-02-20");
    expect(result[2].date).toBe("2099-03-15");
  });

  it("Gegeben: Bereits sortierte Termine — Dann: Reihenfolge bleibt erhalten", () => {
    const response = buildApiResponse([
      { date: "2099-04-01", category: "HM" },
      { date: "2099-04-15", category: "BI" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result[0].date).toBe("2099-04-01");
    expect(result[1].date).toBe("2099-04-15");
  });

  it("Gegeben: Umgekehrt sortierte Termine — Dann: korrekt aufsteigend sortiert", () => {
    const response = buildApiResponse([
      { date: "2099-12-31", category: "WB" },
      { date: "2099-06-01", category: "LT" },
      { date: "2099-01-01", category: "HM" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result[0].date).toBe("2099-01-01");
    expect(result[1].date).toBe("2099-06-01");
    expect(result[2].date).toBe("2099-12-31");
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 8: Ungültige API-Antwort → definierter Fehler
// ---------------------------------------------------------------------------

describe("BDD-Szenario 8: Ungültige API-Antwort erzeugt definierten Fehler", () => {
  it("Gegeben: null als Eingabe — Dann: Error wird geworfen", () => {
    expect(() => parsePickupDates(null)).toThrow();
  });

  it("Gegeben: undefined als Eingabe — Dann: Error wird geworfen", () => {
    expect(() => parsePickupDates(undefined)).toThrow();
  });

  it("Gegeben: Leeres Objekt ohne dates-Feld — Dann: Error wird geworfen", () => {
    expect(() => parsePickupDates({})).toThrow();
  });

  it("Gegeben: dates ist kein Objekt (Array) — Dann: Error wird geworfen", () => {
    expect(() => parsePickupDates({ dates: [] })).toThrow();
  });

  it("Gegeben: dates ist null — Dann: Error wird geworfen", () => {
    expect(() => parsePickupDates({ dates: null })).toThrow();
  });

  it("Gegeben: dates ist ein String — Dann: Error wird geworfen", () => {
    expect(() => parsePickupDates({ dates: "invalid" })).toThrow();
  });

  it("Gegeben: Eintrag ohne category-Feld — Dann: Error wird geworfen", () => {
    const response = {
      dates: {
        "2099-01-01": [
          {
            serviceDate_actual: "01.01.2099",
            serviceDate_regular: "01.01.2099",
            disposalComp: "BSR",
            warningText: "",
          },
        ],
      },
    };
    expect(() => parsePickupDates(response)).toThrow();
  });

  it("Gegeben: Eintrag ohne serviceDate_actual — Dann: Error wird geworfen", () => {
    const response = {
      dates: {
        "2099-01-01": [
          {
            category: "HM",
            serviceDate_regular: "01.01.2099",
            disposalComp: "BSR",
            warningText: "",
          },
        ],
      },
    };
    expect(() => parsePickupDates(response)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 18: Mehrere Abfallarten am selben Tag → separate Einträge
// ---------------------------------------------------------------------------

describe("BDD-Szenario 18: Mehrere Abfallarten am selben Tag werden als separate Einträge dargestellt", () => {
  it("Gegeben: HM und BI am selben Datum — Dann: zwei separate Einträge", () => {
    const response = buildApiResponse([
      { date: "2099-05-10", category: "HM" },
      { date: "2099-05-10", category: "BI" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result).toHaveLength(2);
    const categories = result.map((r) => r.category);
    expect(categories).toContain("HM");
    expect(categories).toContain("BI");
    // Both on the same date
    expect(result[0].date).toBe("2099-05-10");
    expect(result[1].date).toBe("2099-05-10");
  });

  it("Gegeben: Drei Abfallarten am selben Tag — Dann: drei separate Einträge mit jeweiliger Farbe und Icon", () => {
    const response = buildApiResponse([
      { date: "2099-07-01", category: "HM" },
      { date: "2099-07-01", category: "WS" },
      { date: "2099-07-01", category: "LT" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result).toHaveLength(3);
    const categories = result.map((r) => r.category);
    expect(categories).toContain("HM");
    expect(categories).toContain("WS");
    expect(categories).toContain("LT");

    // Each entry must carry its own color and icon
    const hmEntry = result.find((r) => r.category === "HM");
    expect(hmEntry.color).toBe(CATEGORY_MAP.HM.color);
    expect(hmEntry.icon).toBe(CATEGORY_MAP.HM.icon);

    const wsEntry = result.find((r) => r.category === "WS");
    expect(wsEntry.color).toBe(CATEGORY_MAP.WS.color);
    expect(wsEntry.icon).toBe(CATEGORY_MAP.WS.icon);
  });

  it("Gegeben: Gleiche Kategorie zweimal am selben Tag — Dann: beide Einträge vorhanden", () => {
    const response = buildApiResponse([
      { date: "2099-08-15", category: "HM", disposalComp: "BSR" },
      { date: "2099-08-15", category: "HM", disposalComp: "ALBA" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("HM");
    expect(result[1].category).toBe("HM");
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 19: Jahreswechsel Dezember-Januar
// ---------------------------------------------------------------------------

describe("BDD-Szenario 19: Jahreswechsel Dezember-Januar wird korrekt verarbeitet", () => {
  it("Gegeben: Termine im Dezember und Januar des Folgejahres — Dann: beide korrekt geparst und sortiert", () => {
    const response = buildApiResponse([
      { date: "2099-01-10", category: "HM" },
      { date: "2098-12-20", category: "BI" },
      { date: "2098-12-05", category: "WS" },
    ]);

    // today is before all entries
    const result = parsePickupDates(response, "2098-12-01");

    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2098-12-05");
    expect(result[1].date).toBe("2098-12-20");
    expect(result[2].date).toBe("2099-01-10");
  });

  it("Gegeben: Nur Januar-Termin nach Jahreswechsel — Dann: ISO-Datum enthält korrektes Jahr", () => {
    const response = buildApiResponse([{ date: "2099-01-15", category: "LT" }]);

    const result = parsePickupDates(response, "2098-12-01");

    expect(result[0].date).toBe("2099-01-15");
    expect(result[0].date.startsWith("2099")).toBe(true);
  });

  it("Gegeben: Dezember-Termin — Dann: ISO-Datum enthält korrektes Jahr", () => {
    const response = buildApiResponse([{ date: "2098-12-31", category: "WB" }]);

    const result = parsePickupDates(response, "2098-12-01");

    expect(result[0].date).toBe("2098-12-31");
    expect(result[0].date.startsWith("2098")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feste Kategorie-Mappings (Requirements 4.1, 4.2, 4.3)
// ---------------------------------------------------------------------------

describe("Feste Kategorie-Mappings: Alle 5 Kategorien mit Name, Farbe und Icon", () => {
  it("BI (Biogut): korrekter Name, Farbe und Icon", () => {
    const display = getCategoryDisplay("BI");
    expect(display.name).toBe("Biogut");
    expect(display.color).toBe("#8B4513");
    expect(display.icon).toBe("fa-seedling");
  });

  it("HM (Hausmüll): korrekter Name, Farbe und Icon", () => {
    const display = getCategoryDisplay("HM");
    expect(display.name).toBe("Hausmüll");
    expect(display.color).toBe("#808080");
    expect(display.icon).toBe("fa-trash");
  });

  it("LT (Laubtonne): korrekter Name, Farbe und Icon", () => {
    const display = getCategoryDisplay("LT");
    expect(display.name).toBe("Laubtonne");
    expect(display.color).toBe("#228B22");
    expect(display.icon).toBe("fa-leaf");
  });

  it("WS (Wertstoffe): korrekter Name, Farbe und Icon", () => {
    const display = getCategoryDisplay("WS");
    expect(display.name).toBe("Wertstoffe");
    expect(display.color).toBe("#FFD700");
    expect(display.icon).toBe("fa-recycle");
  });

  it("WB (Weihnachtsbaum): korrekter Name, Farbe und Icon", () => {
    const display = getCategoryDisplay("WB");
    expect(display.name).toBe("Weihnachtsbaum");
    expect(display.color).toBe("#006400");
    expect(display.icon).toBe("fa-tree");
  });

  it("Unbekannte Kategorie gibt null oder undefined zurück", () => {
    const display = getCategoryDisplay("XX");
    expect(display).toBeFalsy();
  });

  it("parsePickupDates füllt categoryName, color und icon aus CATEGORY_MAP", () => {
    const response = buildApiResponse([{ date: "2099-03-01", category: "WS" }]);
    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result[0].categoryName).toBe(CATEGORY_MAP.WS.name);
    expect(result[0].color).toBe(CATEGORY_MAP.WS.color);
    expect(result[0].icon).toBe(CATEGORY_MAP.WS.icon);
  });

  it("parsePickupDates setzt disposalCompany aus API-Feld disposalComp", () => {
    const response = buildApiResponse([
      { date: "2099-03-01", category: "WS", disposalComp: "ALBA" },
    ]);
    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result[0].disposalCompany).toBe("ALBA");
  });

  it("parsePickupDates überträgt warningText korrekt", () => {
    const response = buildApiResponse([
      { date: "2099-03-01", category: "HM", warningText: "Verschoben wegen Feiertag" },
    ]);
    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result[0].warningText).toBe("Verschoben wegen Feiertag");
  });
});

// ---------------------------------------------------------------------------
// sortByDate — standalone tests
// ---------------------------------------------------------------------------

describe("sortByDate: Sortiert PickupDate-Array aufsteigend nach Datum", () => {
  it("Leeres Array bleibt leer", () => {
    expect(sortByDate([])).toEqual([]);
  });

  it("Einzelnes Element bleibt unverändert", () => {
    const entry = { date: "2099-06-01", category: "HM" };
    expect(sortByDate([entry])).toEqual([entry]);
  });

  it("Unsortiertes Array wird korrekt sortiert", () => {
    const entries = [
      { date: "2099-09-01", category: "HM" },
      { date: "2099-03-15", category: "BI" },
      { date: "2099-06-30", category: "WS" },
    ];
    const sorted = sortByDate(entries);
    expect(sorted[0].date).toBe("2099-03-15");
    expect(sorted[1].date).toBe("2099-06-30");
    expect(sorted[2].date).toBe("2099-09-01");
  });

  it("Mutiert das Original-Array nicht", () => {
    const entries = [
      { date: "2099-09-01", category: "HM" },
      { date: "2099-03-15", category: "BI" },
    ];
    const original = [...entries];
    sortByDate(entries);
    expect(entries[0].date).toBe(original[0].date);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 4: Kategoriefilterung — nur konfigurierte Kategorien (Req 5.3, 12.3)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 4: Kategoriefilterung — nur konfigurierte Kategorien", () => {
  /** @returns {import('../../utils.js').PickupDate} */
  function makeEntry(category, date = "2099-06-01") {
    const info = CATEGORY_MAP[category] ?? { name: category, color: "", icon: "" };
    return {
      date,
      category,
      categoryName: info.name,
      color: info.color,
      icon: info.icon,
      disposalCompany: "BSR",
      warningText: "",
    };
  }

  it("Gegeben: Termine für BI, HM, WS — Wenn: categories=['HM','WS'] — Dann: nur HM und WS", () => {
    // Given
    const dates = [makeEntry("BI"), makeEntry("HM"), makeEntry("WS")];

    // When
    const result = filterByCategories(dates, ["HM", "WS"]);

    // Then
    expect(result).toHaveLength(2);
    const cats = result.map((d) => d.category);
    expect(cats).toContain("HM");
    expect(cats).toContain("WS");
    expect(cats).not.toContain("BI");
  });

  it("Gegeben: Termine für alle Kategorien — Wenn: categories=['BI'] — Dann: nur BI", () => {
    const dates = ["BI", "HM", "LT", "WS", "WB"].map(makeEntry);

    const result = filterByCategories(dates, ["BI"]);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("BI");
  });

  it("Gegeben: Termine — Wenn: categories=[] (leer) — Dann: leeres Ergebnis", () => {
    const dates = [makeEntry("HM"), makeEntry("WS")];

    const result = filterByCategories(dates, []);

    expect(result).toHaveLength(0);
  });

  it("Gegeben: Leere Terminliste — Dann: leeres Ergebnis unabhängig von categories", () => {
    const result = filterByCategories([], ["HM", "WS"]);

    expect(result).toHaveLength(0);
  });

  it("Gegeben: Termine — Wenn: alle Kategorien konfiguriert — Dann: alle Termine zurückgegeben", () => {
    const dates = ["BI", "HM", "LT", "WS", "WB"].map(makeEntry);

    const result = filterByCategories(dates, ["BI", "HM", "LT", "WS", "WB"]);

    expect(result).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 5 & 22: getRelativeLabel — „Heute", „Morgen", null (Req 6.1, 6.2, 6.3)
// ---------------------------------------------------------------------------

describe("getRelativeLabel: Heute, Morgen oder null", () => {
  it("BDD-Szenario 5: Gegeben: Termin mit heutigem Datum — Dann: Label 'Heute'", () => {
    // Given
    const today = "2099-06-15";

    // When
    const label = getRelativeLabel("2099-06-15", today);

    // Then
    expect(label).toBe("Heute");
  });

  it("BDD-Szenario 22: Gegeben: Termin mit morgigem Datum — Dann: Label 'Morgen'", () => {
    // Given
    const today = "2099-06-15";

    // When
    const label = getRelativeLabel("2099-06-16", today);

    // Then
    expect(label).toBe("Morgen");
  });

  it("Gegeben: Termin in der Zukunft (übermorgen) — Dann: null", () => {
    const today = "2099-06-15";

    const label = getRelativeLabel("2099-06-17", today);

    expect(label).toBeNull();
  });

  it("Gegeben: Termin weit in der Zukunft — Dann: null", () => {
    const today = "2099-06-15";

    const label = getRelativeLabel("2099-12-31", today);

    expect(label).toBeNull();
  });

  it("Gegeben: Jahreswechsel — Heute 31.12., Morgen 01.01. — Dann: 'Morgen'", () => {
    const today = "2099-12-31";

    const label = getRelativeLabel("2100-01-01", today);

    expect(label).toBe("Morgen");
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 23: maxEntries begrenzt Anzeige (Req 3.3)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 23: maxEntries begrenzt die Anzeige auf N Einträge", () => {
  function makeEntries(count) {
    return Array.from({ length: count }, (_, i) => ({
      date: `2099-${String(i + 1).padStart(2, "0")}-01`,
      category: "HM",
      categoryName: "Hausmüll",
      color: "#808080",
      icon: "fa-trash",
      disposalCompany: "BSR",
      warningText: "",
    }));
  }

  it("Gegeben: 10 Termine und maxEntries=3 — Dann: nur die ersten 3 Termine", () => {
    // Given
    const dates = makeEntries(10);
    const maxEntries = 3;

    // When: slicing simulates the maxEntries limit applied in the frontend
    const result = dates.slice(0, maxEntries);

    // Then
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2099-01-01");
    expect(result[2].date).toBe("2099-03-01");
  });

  it("Gegeben: 3 Termine und maxEntries=5 — Dann: alle 3 Termine angezeigt", () => {
    const dates = makeEntries(3);
    const maxEntries = 5;

    const result = dates.slice(0, maxEntries);

    expect(result).toHaveLength(3);
  });

  it("Gegeben: sortByDate + slice — Dann: chronologisch nächste N Termine", () => {
    const unsorted = [
      { date: "2099-05-01", category: "HM" },
      { date: "2099-01-01", category: "BI" },
      { date: "2099-03-01", category: "WS" },
      { date: "2099-07-01", category: "LT" },
    ];
    const maxEntries = 2;

    const result = sortByDate(unsorted).slice(0, maxEntries);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2099-01-01");
    expect(result[1].date).toBe("2099-03-01");
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 7: Warnhinweis wird angezeigt (Req 8.1)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 7: Warnhinweis wird korrekt übertragen", () => {
  it("Gegeben: Termin mit nicht-leerem warningText — Dann: warningText im PickupDate erhalten", () => {
    // Given
    const response = buildApiResponse([
      { date: "2099-06-01", category: "HM", warningText: "Verschoben wegen Feiertag" },
    ]);

    // When
    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    // Then
    expect(result[0].warningText).toBe("Verschoben wegen Feiertag");
  });

  it("Gegeben: Termin mit leerem warningText — Dann: warningText ist leerer String", () => {
    const response = buildApiResponse([{ date: "2099-06-01", category: "HM", warningText: "" }]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    expect(result[0].warningText).toBe("");
  });

  it("Gegeben: Mehrere Termine, nur einer mit Warnhinweis — Dann: nur dieser hat warningText", () => {
    const response = buildApiResponse([
      { date: "2099-06-01", category: "HM", warningText: "Achtung: Frühzeitig bereitstellen" },
      { date: "2099-06-15", category: "BI", warningText: "" },
    ]);

    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    const hmEntry = result.find((r) => r.category === "HM");
    const biEntry = result.find((r) => r.category === "BI");
    expect(hmEntry.warningText).toBe("Achtung: Frühzeitig bereitstellen");
    expect(biEntry.warningText).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.4: Leere Terminliste → „Keine Termine verfügbar"
// ---------------------------------------------------------------------------

describe("Requirement 3.4: Leere Terminliste", () => {
  it("Gegeben: API-Antwort ohne Termine — Dann: parsePickupDates gibt leeres Array zurück", () => {
    // Given: empty dates object
    const response = { dates: {} };

    // When
    const result = parsePickupDates(response, FAR_FUTURE_TODAY);

    // Then: empty array signals "Keine Termine verfügbar" to the frontend
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("Gegeben: Alle Termine liegen in der Vergangenheit — Dann: leeres Array", () => {
    const response = buildApiResponse([
      { date: "2000-01-01", category: "HM" },
      { date: "2000-06-15", category: "BI" },
    ]);

    // today is after all entries
    const result = parsePickupDates(response, "2099-01-01");

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 6: Cache beim Neustart → gecachte Termine sofort angezeigt (Req 11.1, 11.3, 11.6)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 6: Cache beim Neustart — gecachte Termine sofort angezeigt", () => {
  const INTERVAL = 86400000; // 24h in ms
  const now = Date.now();

  function makeCacheWithFutureDates(lastFetchTimestamp) {
    return {
      street: "Bergmannstr.",
      houseNumber: "12",
      addressKey: "10965_Bergmannstr._12",
      pickupDates: [{ date: "2099-12-31", category: "HM" }],
      lastFetchTimestamp,
    };
  }

  it("isCacheValid gibt true zurück wenn Cache zukünftige Termine hat und Intervall NICHT abgelaufen ist", () => {
    const cache = makeCacheWithFutureDates(now - 1000); // 1 second ago
    expect(isCacheValid(cache, {}, now, INTERVAL)).toBe(true);
  });

  it("isCacheValid gibt false zurück wenn Intervall abgelaufen ist (auch wenn zukünftige Termine vorhanden)", () => {
    const cache = makeCacheWithFutureDates(now - INTERVAL - 1); // just expired
    expect(isCacheValid(cache, {}, now, INTERVAL)).toBe(false);
  });

  it("isCacheAddressMatch gibt true zurück wenn Straße und Hausnummer exakt übereinstimmen", () => {
    const cache = { street: "Bergmannstr.", houseNumber: "12" };
    const config = { street: "Bergmannstr.", houseNumber: "12" };
    expect(isCacheAddressMatch(cache, config)).toBe(true);
  });

  it("isCacheAddressMatch berücksichtigt cacheKey für addressKey-only Konfigurationen", () => {
    const cache = {
      cacheKey: "wrong-key",
      street: "",
      houseNumber: "",
      addressKey: "old-address-key",
    };
    const config = { addressKey: "new-address-key", street: "", houseNumber: "" };
    expect(isCacheAddressMatch(cache, config)).toBe(false);
  });

  it("isCacheAddressMatch berücksichtigt legacy addressKey caches ohne cacheKey", () => {
    const cache = {
      street: "",
      houseNumber: "",
      addressKey: "old-address-key",
    };
    const config = { addressKey: "new-address-key", street: "", houseNumber: "" };
    expect(isCacheAddressMatch(cache, config)).toBe(false);
  });

  it("getCacheKey ändert sich bei anderem addressKey und Berlin-Recycling-Providerstatus", () => {
    const base = {
      addressKey: "key-a",
      street: "",
      houseNumber: "",
      berlinRecycling: { enabled: false, usePortal: true },
    };
    expect(getCacheKey(base)).not.toBe(getCacheKey({ ...base, addressKey: "key-b" }));
    expect(getCacheKey(base)).not.toBe(
      getCacheKey({ ...base, berlinRecycling: { enabled: true, usePortal: true } })
    );
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 17: Adresse geändert → Cache verworfen + Neuabruf (Req 11.9)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 17: Adresse geändert — Cache verworfen und Neuabruf", () => {
  it("isCacheAddressMatch gibt false zurück wenn Straße abweicht", () => {
    const cache = { street: "Bergmannstr.", houseNumber: "12" };
    const config = { street: "Oranienstr.", houseNumber: "12" };
    expect(isCacheAddressMatch(cache, config)).toBe(false);
  });

  it("isCacheAddressMatch gibt false zurück wenn Hausnummer abweicht", () => {
    const cache = { street: "Bergmannstr.", houseNumber: "12" };
    const config = { street: "Bergmannstr.", houseNumber: "5" };
    expect(isCacheAddressMatch(cache, config)).toBe(false);
  });

  it("isCacheAddressMatch gibt false zurück wenn Straße und Hausnummer beide abweichen", () => {
    const cache = { street: "Bergmannstr.", houseNumber: "12" };
    const config = { street: "Oranienstr.", houseNumber: "5" };
    expect(isCacheAddressMatch(cache, config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Beschädigter Cache (Req 11.8): loadCache gibt null zurück bei Fehler
// ---------------------------------------------------------------------------

describe("Beschädigter Cache (Req 11.8): loadCache gibt null zurück bei Fehler", () => {
  it("loadCache gibt null zurück wenn Datei nicht existiert", () => {
    const result = loadCache("/tmp/nonexistent_bsr_cache_test_xyz.json");
    expect(result).toBeNull();
  });

  it("loadCache gibt null zurück wenn Datei ungültiges JSON enthält", () => {
    const tmpPath = "/tmp/bsr_cache_test_invalid_json.json";
    fs.writeFileSync(tmpPath, "{ this is not valid json }", "utf8");
    try {
      const result = loadCache(tmpPath);
      expect(result).toBeNull();
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});

// ---------------------------------------------------------------------------
// Cache-Intervall abgelaufen vs. nicht abgelaufen (Req 11.3, 11.4)
// ---------------------------------------------------------------------------

describe("Cache-Intervall: abgelaufen vs. nicht abgelaufen (Req 11.3, 11.4)", () => {
  const INTERVAL = 86400000; // 24h
  const now = Date.now();

  function makeCache(lastFetchTimestamp, pickupDates) {
    return {
      street: "Teststr.",
      houseNumber: "1",
      addressKey: "key",
      pickupDates,
      lastFetchTimestamp,
    };
  }

  it("isCacheValid gibt false zurück wenn now - lastFetchTimestamp > interval", () => {
    const cache = makeCache(now - INTERVAL - 1, [{ date: "2099-12-31", category: "HM" }]);
    expect(isCacheValid(cache, {}, now, INTERVAL)).toBe(false);
  });

  it("isCacheValid gibt true zurück wenn now - lastFetchTimestamp < interval UND mindestens ein zukünftiger Termin vorhanden", () => {
    const cache = makeCache(now - 1000, [{ date: "2099-12-31", category: "HM" }]);
    expect(isCacheValid(cache, {}, now, INTERVAL)).toBe(true);
  });

  it("isCacheValid gibt false zurück wenn KEINE zukünftigen Termine vorhanden (alle in der Vergangenheit), auch wenn Intervall nicht abgelaufen", () => {
    const cache = makeCache(now - 1000, [{ date: "2000-01-01", category: "HM" }]);
    expect(isCacheValid(cache, {}, now, INTERVAL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// saveCache / loadCache round-trip (Req 11.7)
// ---------------------------------------------------------------------------

describe("saveCache / loadCache Round-Trip (Req 11.7)", () => {
  const tmpPath = "/tmp/bsr_cache_test_roundtrip.json";

  it("Mit saveCache gespeicherte Daten können mit loadCache geladen werden und sind äquivalent", () => {
    const data = {
      street: "Bergmannstr.",
      houseNumber: "12",
      addressKey: "10965_Bergmannstr._12",
      pickupDates: [
        {
          date: "2099-06-01",
          category: "HM",
          categoryName: "Hausmüll",
          color: "#808080",
          icon: "fa-trash",
          disposalCompany: "BSR",
          warningText: "",
        },
      ],
      lastFetchTimestamp: 1700000000000,
    };

    saveCache(tmpPath, data);
    const loaded = loadCache(tmpPath);

    try {
      expect(loaded).toEqual(data);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
