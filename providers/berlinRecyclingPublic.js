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

async function fetchBerlinRecyclingPublicDates(executeApiCall, config) {
  const url =
    `https://abfuhrkalender.berlin-recycling.de/api/collections` +
    `?street=${encodeURIComponent(config.street)}` +
    `&houseNumber=${encodeURIComponent(config.houseNumber)}`;
  return parseBerlinRecyclingPublicDates(await executeApiCall(url));
}

module.exports = {
  mapBerlinRecyclingCategory,
  parseBerlinRecyclingPublicDates,
  fetchBerlinRecyclingPublicDates,
};
