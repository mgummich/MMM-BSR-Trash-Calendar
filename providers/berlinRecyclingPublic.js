const { filterPastDates, getCategoryDisplay, sortByDate } = require("../utils.js");

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

function parseBerlinRecyclingPublicDates(response, today = new Date().toISOString().slice(0, 10)) {
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

async function rejectUnsupportedBerlinRecyclingPublicFallback(executeApiCall, config) {
  void executeApiCall;
  void config;

  const error = new Error(
    "Berlin Recycling public fallback is not supported; configure portal credentials instead"
  );
  error.type = "BR_PUBLIC_UNSUPPORTED";
  throw error;
}

module.exports = {
  rejectUnsupportedBerlinRecyclingPublicFallback,
  mapBerlinRecyclingCategory,
  parseBerlinRecyclingPublicDates,
  fetchBerlinRecyclingPublicDates: rejectUnsupportedBerlinRecyclingPublicFallback,
};
