/**
 * providers/berlinRecyclingParse.js — Pure parsing helpers for Berlin Recycling data.
 *
 * Kept free of HTTP so both the portal provider and the tests can reuse them.
 */

const { filterPastDates, getCategoryDisplay, sortByDate } = require("../utils.js");

/**
 * Maps a Berlin Recycling material/fraction label onto a module category code.
 * Matching is case-insensitive and substring-based, because the portal labels vary
 * ("Papier/Pappe", "Restabfall 240 l", …).
 * @param {unknown} value - Raw material or fraction label
 * @returns {"PP"|"GL"|"GW"|"HM"|"WS"|null} Category code, or null if the label is empty or unknown
 */
function mapBerlinRecyclingCategory(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();

  if (!key) {
    return null;
  }
  if (
    key.includes("papier") ||
    key.includes("pappe") ||
    key.includes("karton") ||
    key.includes("paper")
  ) {
    return "PP";
  }
  if (key.includes("glas") || key.includes("glass")) {
    return "GL";
  }
  if (key.includes("gewerbe")) {
    return "GW";
  }
  if (key.includes("restabfall") || key.includes("hausmüll") || key.includes("siedlungsabfall")) {
    return "HM";
  }
  if (key.includes("wertstoff")) {
    return "WS";
  }
  return null;
}

/**
 * Parses the simple `{ dates: [...] }` shape into PickupDate objects.
 * Rows without a recognisable category or without a date are dropped silently.
 * Entries are tagged with `provider: "BERLIN_RECYCLING"`.
 * @param {{dates?: Array<{date?: string, fraction?: string, category?: string, type?: string, warningText?: string}>}} response
 * @param {string} [today] - ISO date string "YYYY-MM-DD" (defaults to the current date)
 * @returns {import("../utils.js").PickupDate[]} Future dates only, sorted ascending
 */
function parseBerlinRecyclingDateList(response, today = new Date().toISOString().slice(0, 10)) {
  const rows = Array.isArray(response?.dates) ? response.dates : [];
  const dates = rows.flatMap((row) => {
    const category = mapBerlinRecyclingCategory(row.fraction || row.category || row.type);
    if (!category || !row.date) {
      return [];
    }
    const display = getCategoryDisplay(category);
    return [
      {
        date: row.date,
        category,
        categoryName: display.name,
        color: display.color,
        icon: display.icon,
        disposalCompany: "Berlin Recycling",
        warningText: row.warningText ?? "",
        provider: "BERLIN_RECYCLING",
      },
    ];
  });
  return sortByDate(filterPastDates(dates, today));
}

module.exports = {
  mapBerlinRecyclingCategory,
  parseBerlinRecyclingDateList,
};
